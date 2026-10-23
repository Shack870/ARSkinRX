import "server-only";

import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import { sendEmail, sendSms, bookingConfirmedEmail } from "@/lib/notify";
import { resolvePrefs } from "@/lib/notifications";
import { formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import type { PayoutVia, ServiceType } from "@/lib/types";

interface ConfirmPaymentInfo {
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  amountCents: number;
  /** Defaults to the fee recorded on the appointment when omitted. */
  platformFeeCents?: number;
  /**
   * "stripe" when the charge used transfer_data to the nurse's Connect account
   * (their share is already theirs — nothing to pay manually). Defaults to
   * "manual".
   */
  payoutVia?: PayoutVia;
  dev?: boolean;
}

export class SlotTakenError extends Error {
  constructor() {
    super("That time was just taken. Please pick another.");
    this.name = "SlotTakenError";
  }
}

/**
 * Creates a `pending_payment` appointment plus its intake record inside a
 * transaction that re-checks for a conflicting booking at the same start time.
 * Shared by patient self-booking (15-min hold) and admin manual booking.
 * Throws SlotTakenError on conflict.
 */
export async function createPendingAppointment(opts: {
  clientId: string;
  providerId: string;
  serviceId: ServiceType;
  start: number;
  end: number;
  priceCents: number;
  platformFeeCents: number;
  holdExpiresAt: number | null;
  intake: Record<string, unknown>;
  photoPaths: string[];
  extra?: Record<string, unknown>;
}): Promise<{ appointmentId: string; intakeId: string }> {
  const now = Date.now();
  const apptRef = adminDb.collection(COLLECTIONS.appointments).doc();
  const intakeRef = adminDb.collection(COLLECTIONS.intakeResponses).doc();

  await adminDb.runTransaction(async (tx) => {
    const conflictSnap = await tx.get(
      adminDb
        .collection(COLLECTIONS.appointments)
        .where("providerId", "==", opts.providerId)
        .where("start", "==", opts.start),
    );
    const blocking = conflictSnap.docs.some((d) => {
      const s = d.get("status");
      if (["cancelled", "no_show"].includes(s)) return false;
      if (s === "pending_payment" && (d.get("holdExpiresAt") ?? 0) < now)
        return false;
      return true;
    });
    if (blocking) throw new SlotTakenError();

    tx.set(apptRef, {
      id: apptRef.id,
      clientId: opts.clientId,
      providerId: opts.providerId,
      serviceId: opts.serviceId,
      start: opts.start,
      end: opts.end,
      status: "pending_payment",
      priceCents: opts.priceCents,
      platformFeeCents: opts.platformFeeCents,
      intakeId: intakeRef.id,
      holdExpiresAt: opts.holdExpiresAt,
      createdAt: now,
      updatedAt: now,
      ...(opts.extra ?? {}),
    });
    tx.set(intakeRef, {
      id: intakeRef.id,
      appointmentId: apptRef.id,
      clientId: opts.clientId,
      providerId: opts.providerId,
      serviceId: opts.serviceId,
      answers: opts.intake,
      photoPaths: opts.photoPaths,
      createdAt: now,
    });
  });

  return { appointmentId: apptRef.id, intakeId: intakeRef.id };
}

/**
 * Marks a pending appointment as booked, creates the payment record, assigns a
 * video room, and notifies the client. Idempotent — safe to call from both the
 * dev bypass and the Stripe webhook (which may retry).
 */
export async function confirmAppointmentBooked(
  appointmentId: string,
  payment: ConfirmPaymentInfo,
): Promise<void> {
  const apptRef = adminDb.collection(COLLECTIONS.appointments).doc(appointmentId);
  const snap = await apptRef.get();
  if (!snap.exists) return;
  const appt = snap.data()!;
  if (appt.status === "booked" || appt.status === "completed") return;

  const now = Date.now();
  const videoRoomId = appt.videoRoomId ?? randomUUID();
  const paymentRef = adminDb.collection(COLLECTIONS.payments).doc();
  const platformFeeCents = payment.platformFeeCents ?? appt.platformFeeCents ?? 0;
  const payoutVia: PayoutVia = payment.payoutVia ?? "manual";

  const batch = adminDb.batch();
  batch.update(apptRef, {
    status: "booked",
    videoRoomId,
    paymentId: paymentRef.id,
    stripePaymentIntentId: payment.stripePaymentIntentId ?? null,
    payoutVia,
    holdExpiresAt: null,
    updatedAt: now,
  });
  batch.set(paymentRef, {
    id: paymentRef.id,
    appointmentId,
    clientId: appt.clientId,
    providerId: appt.providerId,
    amountCents: payment.amountCents,
    platformFeeCents,
    payoutVia,
    currency: "usd",
    stripePaymentIntentId: payment.stripePaymentIntentId ?? `dev_${appointmentId}`,
    stripeChargeId: payment.stripeChargeId ?? null,
    status: "succeeded",
    refundedCents: 0,
    createdAt: now,
    updatedAt: now,
  });
  await batch.commit();

  // Notify the client (best effort).
  try {
    const clientSnap = await adminDb
      .collection(COLLECTIONS.users)
      .doc(appt.clientId)
      .get();
    const email = clientSnap.get("email");
    const phone = clientSnap.get("phone");
    const name = (clientSnap.get("displayName") ?? "there").split(" ")[0];
    const prefs = resolvePrefs(clientSnap.get("notificationPrefs"));
    const service = getService(appt.serviceId as ServiceType);
    const whenText = formatDateTime(appt.start);
    if (prefs.receipt && email) {
      await sendEmail({
        to: email,
        ...bookingConfirmedEmail({
          name,
          serviceName: service?.name ?? "visit",
          whenText,
          amountText: formatCurrency(payment.amountCents),
        }),
      });
    }
    if (prefs.receipt && phone && clientSnap.get("smsOptIn") === true) {
      await sendSms({
        to: phone,
        body: `ARSkinRX: Your ${service?.name ?? "visit"} is booked for ${whenText}. Join from your dashboard. Reply STOP to opt out.`,
      });
    }
  } catch {
    // Notifications are non-critical.
  }
}
