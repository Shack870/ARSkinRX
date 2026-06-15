import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe";

/**
 * POST /api/admin/payments/[id]/refund { amountCents? }
 * Manual refund. Issues a Stripe refund when the payment was real; for dev
 * payments it just records the refund. Note: clinic policy is no refunds within
 * 48 hours of the visit — that's enforced by policy/Terms, but admins can still
 * override here when warranted.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}) as { amountCents?: number; force?: boolean });
  const amountCents = body?.amountCents;

  const ref = adminDb.collection(COLLECTIONS.payments).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = snap.data()!;

  // Policy guardrail: no refunds within 48 hours of the visit unless the visit
  // was cancelled by the provider/admin (refund-eligible) or the admin forces it.
  const apptSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .doc(p.appointmentId)
    .get();
  if (apptSnap.exists) {
    const start = apptSnap.get("start") as number;
    const refundEligible = apptSnap.get("refundEligible") === true;
    const within48 = start - Date.now() < 48 * 60 * 60 * 1000;
    if (within48 && !refundEligible && !body?.force) {
      return NextResponse.json(
        {
          error: "within_48h",
          message:
            "This visit is within 48 hours. Per policy refunds aren't normally issued — resend with force to override.",
        },
        { status: 409 },
      );
    }
  }

  const already = p.refundedCents ?? 0;
  const refundAmount = Number.isFinite(Number(amountCents))
    ? Math.min(Number(amountCents), p.amountCents - already)
    : p.amountCents - already;
  if (refundAmount <= 0) {
    return NextResponse.json({ error: "Nothing to refund" }, { status: 400 });
  }

  const intentId = p.stripePaymentIntentId as string;
  const isDev = !intentId || intentId.startsWith("dev_");
  const stripe = getStripe();

  if (!isDev && stripe) {
    try {
      await stripe.refunds.create({
        payment_intent: intentId,
        amount: refundAmount,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Stripe refund failed" },
        { status: 502 },
      );
    }
  }

  const totalRefunded = already + refundAmount;
  await ref.update({
    refundedCents: totalRefunded,
    status: totalRefunded >= p.amountCents ? "refunded" : "partially_refunded",
    updatedAt: Date.now(),
  });
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: admin.uid,
    action: "payment.refund",
    targetType: "payment",
    targetId: id,
    meta: { refundAmount, dev: isDev },
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, refundedCents: totalRefunded });
}
