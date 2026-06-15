import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { sendEmail, sendSms } from "@/lib/notify";
import { formatCurrency } from "@/lib/utils";

/**
 * GET /api/admin/payouts
 * Returns outstanding balances owed to each provider (net of platform fee) for
 * completed, not-yet-paid visits, plus recent payout history.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const completedSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("status", "==", "completed")
    .get();

  const owed = new Map<
    string,
    { providerId: string; amountCents: number; visitCount: number }
  >();
  for (const d of completedSnap.docs) {
    if (d.get("providerPaidAt")) continue;
    const providerId = d.get("providerId");
    const net = (d.get("priceCents") ?? 0) - (d.get("platformFeeCents") ?? 0);
    const cur = owed.get(providerId) ?? {
      providerId,
      amountCents: 0,
      visitCount: 0,
    };
    cur.amountCents += net;
    cur.visitCount += 1;
    owed.set(providerId, cur);
  }

  const outstanding = await Promise.all(
    Array.from(owed.values()).map(async (o) => {
      const u = await adminDb.collection(COLLECTIONS.users).doc(o.providerId).get();
      return { ...o, providerName: u.get("displayName") ?? "—" };
    }),
  );

  const historySnap = await adminDb
    .collection(COLLECTIONS.payouts)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const history = await Promise.all(
    historySnap.docs.map(async (d) => {
      const u = await adminDb
        .collection(COLLECTIONS.users)
        .doc(d.get("providerId"))
        .get();
      return {
        id: d.id,
        providerName: u.get("displayName") ?? "—",
        amountCents: d.get("amountCents"),
        method: d.get("method"),
        note: d.get("note") ?? "",
        visitCount: (d.get("appointmentIds") ?? []).length,
        createdAt: d.get("createdAt"),
      };
    }),
  );

  return NextResponse.json({ outstanding, history });
}

/**
 * POST /api/admin/payouts { providerId, method, note }
 * Records a manual payout covering all of a provider's outstanding completed
 * visits, marks those visits paid, and notifies the provider (confirmation).
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { providerId, method, note } = await req.json().catch(() => ({}));
  if (!providerId || !method) {
    return NextResponse.json(
      { error: "providerId and method are required" },
      { status: 400 },
    );
  }

  const completedSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("providerId", "==", providerId)
    .where("status", "==", "completed")
    .get();

  const unpaid = completedSnap.docs.filter((d) => !d.get("providerPaidAt"));
  if (unpaid.length === 0) {
    return NextResponse.json({ error: "Nothing outstanding" }, { status: 400 });
  }

  const amountCents = unpaid.reduce(
    (sum, d) => sum + ((d.get("priceCents") ?? 0) - (d.get("platformFeeCents") ?? 0)),
    0,
  );
  const now = Date.now();
  const payoutRef = adminDb.collection(COLLECTIONS.payouts).doc();

  const batch = adminDb.batch();
  batch.set(payoutRef, {
    id: payoutRef.id,
    providerId,
    amountCents,
    appointmentIds: unpaid.map((d) => d.id),
    method: String(method),
    note: note ? String(note) : "",
    createdBy: admin.uid,
    createdAt: now,
  });
  for (const d of unpaid) {
    batch.update(d.ref, { providerPaidAt: now, payoutId: payoutRef.id });
  }
  batch.set(adminDb.collection(COLLECTIONS.auditLogs).doc(), {
    actorId: admin.uid,
    action: "payout.create",
    targetType: "provider",
    targetId: providerId,
    meta: { amountCents, visits: unpaid.length, method },
    timestamp: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  // Confirmation to the provider (best effort).
  try {
    const u = await adminDb.collection(COLLECTIONS.users).doc(providerId).get();
    const email = u.get("email");
    const phone = u.get("phone");
    const msg = `ARSkinRX: A payout of ${formatCurrency(amountCents)} for ${unpaid.length} visit(s) has been sent via ${method}.`;
    if (email)
      await sendEmail({
        to: email,
        subject: "Your ARSkinRX payout has been sent",
        html: `<p>${msg}</p>${note ? `<p>Note: ${note}</p>` : ""}`,
      });
    if (phone) await sendSms({ to: phone, body: msg });
  } catch {
    // non-critical
  }

  return NextResponse.json({ ok: true, amountCents, visits: unpaid.length });
}
