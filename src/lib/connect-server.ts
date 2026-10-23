import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getStripe } from "@/lib/stripe";

/**
 * Sends the nurse their share of a live (on-demand) visit through Stripe
 * Connect once the visit is completed.
 *
 * Scheduled visits are split at checkout with a destination charge, but a live
 * request is paid before any nurse has accepted it, so there's no destination
 * to send to at that point. Instead we create a Transfer from the original
 * charge (source_transaction) to the nurse's Express account when the visit
 * completes. Idempotent per appointment; no-ops for nurses who haven't
 * onboarded (they stay on manual payouts) and for dev-bypass payments.
 */
export async function transferLiveVisitShare(appointmentId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  const apptRef = adminDb.collection(COLLECTIONS.appointments).doc(appointmentId);
  const appt = (await apptRef.get()).data();
  if (!appt || appt.status !== "completed" || appt.stripeTransferId) return;
  if (appt.providerPaidAt || appt.payoutVia === "stripe") return;

  const paymentIntentId: string | undefined = appt.stripePaymentIntentId;
  if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) return;

  const providerSnap = await adminDb
    .collection(COLLECTIONS.providers)
    .doc(appt.providerId)
    .get();
  const destination = providerSnap.get("stripeAccountId") as string | undefined;
  if (!destination || providerSnap.get("stripeOnboardingComplete") !== true) return;

  const shareCents = (appt.priceCents ?? 0) - (appt.platformFeeCents ?? 0);
  if (shareCents <= 0) return;

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const chargeId =
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : intent.latest_charge?.id;
  if (!chargeId) return;

  const transfer = await stripe.transfers.create(
    {
      amount: shareCents,
      currency: "usd",
      destination,
      source_transaction: chargeId,
      transfer_group: appointmentId,
      metadata: { appointmentId, providerId: appt.providerId },
    },
    { idempotencyKey: `live-share:${appointmentId}` },
  );

  const now = Date.now();
  await apptRef.update({
    payoutVia: "stripe",
    stripeTransferId: transfer.id,
    updatedAt: now,
  });
  if (appt.paymentId) {
    await adminDb
      .collection(COLLECTIONS.payments)
      .doc(appt.paymentId)
      .set({ payoutVia: "stripe", stripeTransferId: transfer.id, updatedAt: now }, { merge: true });
  }
}
