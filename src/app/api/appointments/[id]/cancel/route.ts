import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import { sendEmail, sendSms } from "@/lib/notify";
import { formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { refundAppointment } from "@/lib/refunds-server";
import type { ServiceType } from "@/lib/types";

/** Patients get a full automatic refund when cancelling this far ahead. */
const CANCEL_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/appointments/[id]/cancel  { acknowledgeNoRefund?: boolean }
 *
 * Cancels a booked/pending visit. Either participant or an admin may cancel.
 * Refund policy:
 * - Provider/admin cancellation → always a full automatic refund.
 * - Patient cancellation ≥ 24h before start → full automatic refund.
 * - Patient cancellation < 24h → no refund. Because a still-booked visit can
 *   be rescheduled once for free, we leave it booked and answer 409 pointing
 *   them at reschedule, unless the client explicitly sends
 *   `acknowledgeNoRefund: true`, in which case the visit is cancelled with no
 *   refund.
 * - No-shows are handled by /no-show and are never refunded.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    acknowledgeNoRefund?: boolean;
  };
  const ref = adminDb.collection(COLLECTIONS.appointments).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const a = snap.data()!;
  const isClient = a.clientId === user.uid;
  const isProvider = a.providerId === user.uid;
  const isAdmin = user.isAdmin;
  if (!isClient && !isProvider && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["booked", "pending_payment", "in_progress"].includes(a.status)) {
    return NextResponse.json(
      { error: "This visit can't be cancelled." },
      { status: 409 },
    );
  }

  const now = Date.now();
  const cancelledByRole = isClient && !isAdmin ? "client" : isProvider ? "provider" : "admin";
  const paid = a.status !== "pending_payment";
  const insideWindow = a.start - now < CANCEL_REFUND_WINDOW_MS;
  const refundEligible = cancelledByRole !== "client" || !insideWindow;

  if (cancelledByRole === "client" && paid && !refundEligible) {
    const canReschedule = !a.rescheduledToId && a.start > now;
    if (!body.acknowledgeNoRefund) {
      return NextResponse.json(
        {
          error: "within_24h",
          canReschedule,
          message: canReschedule
            ? "Visits cancelled within 24 hours aren't refunded. You can reschedule this visit once for free instead — or cancel anyway without a refund."
            : "Visits cancelled within 24 hours aren't refunded.",
        },
        { status: 409 },
      );
    }
  }

  await ref.update({
    status: "cancelled",
    cancelledBy: cancelledByRole,
    cancelledAt: now,
    refundEligible,
    holdExpiresAt: null,
    updatedAt: now,
  });
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "appointment.cancel",
    targetType: "appointment",
    targetId: id,
    meta: { by: cancelledByRole, refundEligible, insideWindow },
    timestamp: FieldValue.serverTimestamp(),
  });

  // Automatic refund for eligible, paid cancellations.
  let refund: { refundId: string; amountCents: number } | null = null;
  let refundError: string | null = null;
  if (paid && refundEligible) {
    try {
      const r = await refundAppointment(id, {
        reason:
          cancelledByRole === "client"
            ? "Patient cancelled 24+ hours before the visit"
            : `Cancelled by ${cancelledByRole}`,
        actorId: user.uid,
      });
      refund = { refundId: r.refundId, amountCents: r.amountCents };
    } catch (e) {
      // Leave refundEligible: true so an admin can issue it manually.
      refundError = e instanceof Error ? e.message : "Refund failed";
    }
  }

  // Notify the other party (best effort).
  try {
    const service = getService(a.serviceId as ServiceType);
    const when = formatDateTime(a.start);
    const otherUid = isClient ? a.providerId : a.clientId;
    const other = await adminDb.collection(COLLECTIONS.users).doc(otherUid).get();
    const email = other.get("email");
    const phone = other.get("phone");
    const who = cancelledByRole === "client" ? "The patient" : "The provider";
    let msg = `ARSkinRX: ${who} cancelled the ${service?.name ?? "visit"} on ${when}.`;
    if (!isClient && refund) {
      msg += ` A refund of ${formatCurrency(refund.amountCents)} has been issued to your original payment method (allow 5–10 business days).`;
    }
    if (email)
      await sendEmail({ to: email, subject: "A visit was cancelled", html: `<p>${msg}</p>` });
    if (phone && other.get("smsOptIn") === true) {
      await sendSms({ to: phone, body: `${msg} Reply STOP to opt out.` });
    }
  } catch {
    // non-critical
  }

  const message = !paid
    ? "Your hold was released."
    : refund
      ? `Cancelled. ${formatCurrency(refund.amountCents)} is being refunded to your original payment method.`
      : refundEligible
        ? "Cancelled. Your refund is being processed."
        : "Cancelled. Per our policy, visits cancelled within 24 hours aren't refunded.";

  return NextResponse.json({
    ok: true,
    refundEligible,
    refunded: Boolean(refund),
    refundedCents: refund?.amountCents ?? 0,
    refundError,
    message,
  });
}
