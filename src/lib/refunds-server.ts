import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getStripe } from "@/lib/stripe";

/**
 * Server-side refund helpers shared by the cancel route, the live-visit flow
 * and admin tooling. All Stripe calls are idempotent (keyed on the target doc)
 * and every helper short-circuits when the target doc already has a refundId.
 */

export interface RefundResult {
  refundId: string;
  amountCents: number;
  /** True when no Stripe call was made (dev/manual payment, or already refunded). */
  skipped?: boolean;
}

export interface RefundPaymentIntentMeta {
  /** Firestore doc the refund belongs to; used for Stripe metadata + idempotency. */
  targetType?: "appointment" | "liveRequest";
  targetId?: string;
  /**
   * Destination charge (Connect split at checkout): claw back the nurse's share
   * and our application fee so the patient gets the full amount back.
   */
  reverseTransfer?: boolean;
  /** Extra Stripe metadata. Values must be strings. */
  extra?: Record<string, string>;
}

/** Payment intents created without Stripe (dev bypass or manual records). */
export function isPlaceholderIntent(paymentIntentId: string | null | undefined) {
  return (
    !paymentIntentId ||
    paymentIntentId.startsWith("dev_") ||
    paymentIntentId.startsWith("manual_")
  );
}

/**
 * Issues a Stripe refund against a payment intent. Full refund when
 * `amountCents` is omitted. Throws when Stripe isn't configured or rejects
 * the refund; callers decide whether that's fatal.
 */
export async function refundPaymentIntent(
  paymentIntentId: string,
  amountCents: number | undefined,
  reason: string,
  meta: RefundPaymentIntentMeta = {},
): Promise<RefundResult> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      ...(amountCents !== undefined ? { amount: amountCents } : {}),
      reason: "requested_by_customer",
      ...(meta.reverseTransfer
        ? { reverse_transfer: true, refund_application_fee: true }
        : {}),
      metadata: {
        reason,
        ...(meta.targetType ? { targetType: meta.targetType } : {}),
        ...(meta.targetId ? { targetId: meta.targetId } : {}),
        ...(meta.extra ?? {}),
      },
    },
    meta.targetId
      ? {
          idempotencyKey: `refund_${meta.targetType ?? "pi"}_${meta.targetId}_${
            amountCents ?? "full"
          }`,
        }
      : undefined,
  );
  return { refundId: refund.id, amountCents: refund.amount };
}

/**
 * Mirrors a refund onto the payments/{id} ledger row (admin billing + patient
 * billing pages read these). Best effort — the appointment doc is the source
 * of truth for whether a refund happened.
 */
async function recordOnPaymentLedger(
  appointmentId: string,
  paymentId: string | undefined,
  refundedCents: number,
) {
  try {
    let ref = paymentId
      ? adminDb.collection(COLLECTIONS.payments).doc(paymentId)
      : null;
    if (!ref) {
      const q = await adminDb
        .collection(COLLECTIONS.payments)
        .where("appointmentId", "==", appointmentId)
        .limit(1)
        .get();
      ref = q.empty ? null : q.docs[0].ref;
    }
    if (!ref) return;
    const snap = await ref.get();
    if (!snap.exists) return;
    const amountCents = (snap.get("amountCents") as number) ?? 0;
    const total = Math.min(
      amountCents,
      ((snap.get("refundedCents") as number) ?? 0) + refundedCents,
    );
    await ref.update({
      refundedCents: total,
      status: total >= amountCents ? "refunded" : "partially_refunded",
      updatedAt: Date.now(),
    });
  } catch {
    // ledger mirror is non-critical
  }
}

/**
 * Best-effort reversal of a post-visit Connect transfer (live visits pay the
 * nurse via a separate Transfer rather than a destination charge). Returns the
 * reversal id or null.
 */
async function reverseTransferIfAny(
  transferId: string | undefined,
  amountCents: number | undefined,
  appointmentId: string,
): Promise<string | null> {
  if (!transferId) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const reversal = await stripe.transfers.createReversal(
      transferId,
      {
        ...(amountCents !== undefined ? { amount: amountCents } : {}),
        metadata: { appointmentId },
      },
      { idempotencyKey: `transfer_reversal_${appointmentId}` },
    );
    return reversal.id;
  } catch {
    return null;
  }
}

/**
 * Refunds a scheduled/live appointment's payment. Full refund by default.
 * - Idempotent: returns the existing refundId when one is already recorded.
 * - `dev_`/`manual_` intents are just marked refunded (no Stripe call).
 * - Destination charges (payoutVia === 'stripe') reverse the nurse's share.
 * Writes refundId/refundedCents/refundedAt on the appointment and audit-logs.
 */
export async function refundAppointment(
  appointmentId: string,
  opts: { amountCents?: number; reason: string; actorId?: string },
): Promise<RefundResult> {
  const ref = adminDb.collection(COLLECTIONS.appointments).doc(appointmentId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Appointment not found");
  const a = snap.data()!;

  if (a.refundId) {
    return {
      refundId: a.refundId as string,
      amountCents: (a.refundedCents as number) ?? 0,
      skipped: true,
    };
  }

  const intentId = a.stripePaymentIntentId as string | undefined;
  const requested = opts.amountCents ?? (a.priceCents as number) ?? 0;
  const now = Date.now();

  let result: RefundResult;
  if (isPlaceholderIntent(intentId)) {
    result = {
      refundId: `${intentId?.startsWith("manual_") ? "manual" : "dev"}_refund_${appointmentId}`,
      amountCents: requested,
      skipped: true,
    };
  } else {
    // Live visits pay the nurse with a separate Transfer after completion;
    // scheduled visits split at checkout via a destination charge.
    const viaTransfer = Boolean(a.stripeTransferId);
    result = await refundPaymentIntent(
      intentId!,
      opts.amountCents,
      opts.reason,
      {
        targetType: "appointment",
        targetId: appointmentId,
        reverseTransfer: a.payoutVia === "stripe" && !viaTransfer,
      },
    );
    if (viaTransfer && a.payoutVia === "stripe") {
      // Nurse's share of a partial refund is proportional to the visit price.
      const share =
        opts.amountCents !== undefined && a.priceCents
          ? Math.round(
              ((a.priceCents - (a.platformFeeCents ?? 0)) * opts.amountCents) /
                a.priceCents,
            )
          : undefined;
      await reverseTransferIfAny(
        a.stripeTransferId as string,
        share,
        appointmentId,
      );
    }
  }

  await ref.update({
    refundId: result.refundId,
    refundedCents: result.amountCents,
    refundedAt: now,
    refundEligible: true,
    updatedAt: now,
  });
  await recordOnPaymentLedger(
    appointmentId,
    a.paymentId as string | undefined,
    result.amountCents,
  );
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: opts.actorId ?? "system",
    action: "appointment.refund",
    targetType: "appointment",
    targetId: appointmentId,
    meta: {
      refundId: result.refundId,
      amountCents: result.amountCents,
      reason: opts.reason,
      dev: result.skipped === true,
    },
    timestamp: FieldValue.serverTimestamp(),
  });

  return result;
}

/**
 * Same as refundAppointment but for liveRequests/{id} (a patient who paid for
 * a No-Wait Live visit and was never seen, or chose to schedule instead).
 */
export async function refundLiveRequest(
  liveRequestId: string,
  opts: { amountCents?: number; reason: string; actorId?: string },
): Promise<RefundResult> {
  const ref = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Live request not found");
  const r = snap.data()!;

  if (r.refundId) {
    return {
      refundId: r.refundId as string,
      amountCents: (r.refundedCents as number) ?? 0,
      skipped: true,
    };
  }

  const intentId = r.stripePaymentIntentId as string | undefined;
  const requested = opts.amountCents ?? (r.priceCents as number) ?? 0;
  const now = Date.now();

  let result: RefundResult;
  if (isPlaceholderIntent(intentId)) {
    result = {
      refundId: `${intentId?.startsWith("manual_") ? "manual" : "dev"}_refund_${liveRequestId}`,
      amountCents: requested,
      skipped: true,
    };
  } else {
    // Live checkout charges the platform directly (no destination charge).
    result = await refundPaymentIntent(intentId!, opts.amountCents, opts.reason, {
      targetType: "liveRequest",
      targetId: liveRequestId,
    });
  }

  await ref.update({
    refundId: result.refundId,
    refundedCents: result.amountCents,
    refundedAt: now,
    refundEligible: true,
    updatedAt: now,
  });
  // If the request was matched into an appointment, mirror onto its ledger row.
  if (r.appointmentId) {
    await recordOnPaymentLedger(r.appointmentId as string, undefined, result.amountCents);
  }
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: opts.actorId ?? "system",
    action: "liveRequest.refund",
    targetType: "liveRequest",
    targetId: liveRequestId,
    meta: {
      refundId: result.refundId,
      amountCents: result.amountCents,
      reason: opts.reason,
      dev: result.skipped === true,
    },
    timestamp: FieldValue.serverTimestamp(),
  });

  return result;
}
