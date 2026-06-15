import "server-only";

import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import { sendEmail, sendSms, bookingConfirmedEmail } from "@/lib/notify";
import { formatDateTime } from "@/lib/datetime";
import type { ServiceType } from "@/lib/types";

interface ConfirmPaymentInfo {
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  amountCents: number;
  platformFeeCents: number;
  dev?: boolean;
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

  const batch = adminDb.batch();
  batch.update(apptRef, {
    status: "booked",
    videoRoomId,
    paymentId: paymentRef.id,
    stripePaymentIntentId: payment.stripePaymentIntentId ?? null,
    holdExpiresAt: null,
    updatedAt: now,
  });
  batch.set(paymentRef, {
    id: paymentRef.id,
    appointmentId,
    clientId: appt.clientId,
    providerId: appt.providerId,
    amountCents: payment.amountCents,
    platformFeeCents: payment.platformFeeCents,
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
    const service = getService(appt.serviceId as ServiceType);
    const whenText = formatDateTime(appt.start);
    if (email) {
      await sendEmail({
        to: email,
        ...bookingConfirmedEmail({
          name,
          serviceName: service?.name ?? "visit",
          whenText,
        }),
      });
    }
    if (phone) {
      await sendSms({
        to: phone,
        body: `ARSkinRX: Your ${service?.name ?? "visit"} is booked for ${whenText}. Join from your dashboard.`,
      });
    }
  } catch {
    // Notifications are non-critical.
  }
}
