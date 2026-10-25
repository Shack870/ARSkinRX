import "server-only";

import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import {
  LIVE_FRESH_MS,
  OFFER_TTL_MS,
  MAX_POPS_BEFORE_DECLINE,
  chooseQueueNurse,
  isFresh,
  loadServiceTimelines,
  onProviderFreed,
  recomputeQueueForProvider,
  tickLiveQueue,
} from "@/lib/live-queue";
import { canAdmitAt } from "@/lib/live-queue-math";
import { refundLiveRequest } from "@/lib/refunds-server";
import type { ServiceType } from "@/lib/types";

export { LIVE_FRESH_MS, OFFER_TTL_MS };

/** How long a paid request keeps searching before it's considered expired. */
export const LIVE_SEARCH_MS = 120_000;
/** Overall safety cap for one search round (offers to idle nurses). */
export const LIVE_MAX_MS = 5 * 60_000;
/** Default premium price for a No-Wait Live (no-appointment) visit. */
export const DEFAULT_LIVE_PRICE_CENTS = 9900;

/** Admin-configurable flat price for real-time visits (settings/live). */
export async function getLivePriceCents(): Promise<number> {
  const snap = await adminDb
    .collection(COLLECTIONS.settings)
    .doc("live")
    .get();
  const v = snap.get("realtimePriceCents");
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_LIVE_PRICE_CENTS;
}

/** Count nurses currently idle for a live visit in this service line. */
export async function countAvailableProviders(
  serviceId: ServiceType,
): Promise<number> {
  const snap = await adminDb
    .collection(COLLECTIONS.presence)
    .where("online", "==", true)
    .where("conditions", "array-contains", serviceId)
    .get();
  const now = Date.now();
  return snap.docs.filter(
    (d) => d.get("busy") !== true && isFresh(d.get("lastSeenAt"), now),
  ).length;
}

export interface AcceptResult {
  ok: boolean;
  appointmentId?: string;
  reason?: string;
}

export interface LiveOffer {
  id: string;
  serviceId: ServiceType;
  priceCents: number;
  offerExpiresAt: number;
  /** Set when the patient came off the queue: how long they've been waiting. */
  queuedWaitMs?: number;
}

export interface OrchestrateResult {
  status: string;
  offeredTo?: string | null;
  appointmentId?: string;
}

/**
 * Round-robin driver. Ensures a searching request has exactly one active offer
 * to one idle, admissible nurse for up to 15s. On timeout, that nurse is marked
 * declined and the next eligible nurse is pinged. When no idle nurse is left
 * but someone eligible is still online (busy or gated by a booking), the
 * request joins that nurse's line (`queued`) instead of expiring. Only when
 * nobody is online does it expire. Safe to call from multiple pollers.
 */
export async function orchestrateLiveRequest(
  liveRequestId: string,
): Promise<OrchestrateResult> {
  const reqRef = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  let out: OrchestrateResult = { status: "searching" };

  // Quick pre-read so we only build timelines for requests that need a move.
  const pre = await reqRef.get();
  if (!pre.exists) return { status: "not_found" };
  if (pre.get("status") !== "searching") {
    return { status: pre.get("status"), appointmentId: pre.get("appointmentId") };
  }
  const preNow = Date.now();
  if (pre.get("offeredTo") && (pre.get("offerExpiresAt") ?? 0) > preNow) {
    return { status: "searching", offeredTo: pre.get("offeredTo") };
  }
  const serviceId = pre.get("serviceId") as ServiceType;
  const timelines = await loadServiceTimelines(serviceId, preNow);

  let queuedTo: string | null = null;

  await adminDb.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      out = { status: "not_found" };
      return;
    }
    const req = reqSnap.data()!;
    if (req.status !== "searching") {
      out = { status: req.status, appointmentId: req.appointmentId };
      return;
    }
    const now = Date.now();

    // Current offer still active → leave it.
    if (req.offeredTo && (req.offerExpiresAt ?? 0) > now) {
      out = { status: "searching", offeredTo: req.offeredTo };
      return;
    }

    // Advance: the previous nurse's offer lapsed. An unanswered ring for a
    // queued patient doesn't count as a decline (the nurse may just be
    // between tasks) until it has happened a few times; until then the
    // patient goes back to their place in line and the queue re-rings after
    // a cooldown.
    const declined = new Set<string>(req.declinedBy ?? []);
    const fromQueue = !!req.queuedProviderId && req.offeredTo === req.queuedProviderId;
    const queueRingsLeft = fromQueue && (req.popCount ?? 0) < MAX_POPS_BEFORE_DECLINE;
    if (req.offeredTo && !queueRingsLeft) declined.add(req.offeredTo);

    const candSnap = await tx.get(
      adminDb
        .collection(COLLECTIONS.presence)
        .where("online", "==", true)
        .where("conditions", "array-contains", req.serviceId),
    );
    const pooled = candSnap.docs.filter((d) => isFresh(d.get("lastSeenAt"), now));
    const next = pooled
      .filter((d) => {
        if (d.get("busy") === true || declined.has(d.id)) return false;
        // Don't instantly re-ring the queue nurse who just let it lapse.
        if (queueRingsLeft && d.id === req.offeredTo) return false;
        const tl = timelines.get(d.id);
        // Admission rule: a 15-minute visit must fit before their next booking.
        return !tl || (!tl.busyNow && canAdmitAt(now, tl.scheduled));
      })
      .sort((a, b) => (a.get("lastSeenAt") ?? 0) - (b.get("lastSeenAt") ?? 0))[0];

    if (next) {
      tx.update(reqRef, {
        offeredTo: next.id,
        offerExpiresAt: now + OFFER_TTL_MS,
        declinedBy: [...declined],
        searchStartedAt: req.searchStartedAt ?? now,
        updatedAt: now,
      });
      out = { status: "searching", offeredTo: next.id };
      return;
    }

    if (queueRingsLeft) {
      // Back to the same place in line; tickLiveQueue re-rings after POP_COOLDOWN_MS.
      tx.update(reqRef, {
        status: "queued",
        offeredTo: null,
        offerExpiresAt: null,
        updatedAt: now,
      });
      queuedTo = req.queuedProviderId;
      out = { status: "queued" };
      return;
    }

    // Nobody idle. Is anyone eligible still online? Then wait in their line.
    const online = new Set(pooled.map((d) => d.id));
    const queueable = new Map(
      [...timelines.entries()].filter(([id]) => online.has(id)),
    );
    const best = chooseQueueNurse(queueable, declined);
    if (best) {
      const queuedAt = req.queuedAt ?? now;
      tx.update(reqRef, {
        status: "queued",
        queuedProviderId: best.providerId,
        queuedProviderName: best.providerName,
        queuedAt,
        position: best.queue.length + 1,
        estimateAt: best.nextOpeningAt,
        currentVisitEndsAt: best.currentVisitEndsAt,
        nextScheduledStart: best.nextScheduledStart,
        waitOfferedScheduleAt: req.waitOfferedScheduleAt ?? null,
        offeredTo: null,
        offerExpiresAt: null,
        declinedBy: [...declined],
        updatedAt: now,
      });
      queuedTo = best.providerId;
      out = { status: "queued" };
      return;
    }

    // Safety cap applies only when nobody can take them.
    tx.update(reqRef, {
      status: "expired",
      refundEligible: true,
      expireReason: "no_nurse",
      offeredTo: null,
      offerExpiresAt: null,
      declinedBy: [...declined],
      updatedAt: now,
    });
    out = { status: "expired" };
  });

  if (out.status === "expired") {
    // Paid and never seen → automatic full refund.
    await refundLiveRequest(liveRequestId, { reason: "no_nurse_available" }).catch(
      (err) => console.error("[live] auto-refund failed", liveRequestId, err),
    );
  } else if (queuedTo) {
    await recomputeQueueForProvider(queuedTo).catch(() => {});
  }

  return out;
}

/**
 * Payment landed (verify-on-return or webhook): flip the request to searching
 * and immediately offer it to the first nurse. Idempotent — a second caller
 * finds the request already past pending_payment and just re-runs the
 * orchestrator, which is a no-op while an offer is active.
 */
export async function markLivePaidAndMatch(
  liveRequestId: string,
  stripePaymentIntentId: string | null,
): Promise<OrchestrateResult> {
  const ref = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") !== "pending_payment") return;
    const now = Date.now();
    tx.update(ref, {
      status: "searching",
      stripePaymentIntentId,
      paidAt: now,
      expiresAt: now + LIVE_SEARCH_MS,
      // Restart the safety clock from payment, not from when the form was filled.
      createdAt: now,
      searchStartedAt: now,
      updatedAt: now,
    });
  });
  return orchestrateLiveRequest(liveRequestId);
}

/**
 * Advance any searching request whose current offer has lapsed (or that has
 * no offer yet), then run the queue (ring free nurses, refresh estimates,
 * re-home or refund patients whose nurse left). Called from the nurses'
 * incoming poll and the patient's status poll so the system keeps moving even
 * if one side's tab is closed or backgrounded.
 */
export async function advanceStaleLiveRequests(): Promise<void> {
  const now = Date.now();
  const snap = await adminDb
    .collection(COLLECTIONS.liveRequests)
    .where("status", "==", "searching")
    .get();
  await Promise.all(
    snap.docs
      .filter((d) => !d.get("offeredTo") || (d.get("offerExpiresAt") ?? 0) <= now)
      .map((d) => orchestrateLiveRequest(d.id).catch(() => {})),
  );
  await tickLiveQueue(now).catch((err) =>
    console.error("[live] queue tick failed", err),
  );
}

/** The live request currently offered to this provider (their turn), if any. */
export async function incomingForProvider(
  providerId: string,
): Promise<LiveOffer[]> {
  const now = Date.now();
  const presSnap = await adminDb
    .collection(COLLECTIONS.presence)
    .doc(providerId)
    .get();
  if (
    !presSnap.exists ||
    presSnap.get("online") !== true ||
    presSnap.get("busy") === true ||
    !isFresh(presSnap.get("lastSeenAt"), now)
  ) {
    return [];
  }

  await advanceStaleLiveRequests();

  const snap = await adminDb
    .collection(COLLECTIONS.liveRequests)
    .where("offeredTo", "==", providerId)
    .get();

  return snap.docs
    .filter(
      (d) => d.get("status") === "searching" && (d.get("offerExpiresAt") ?? 0) > now,
    )
    .map((d) => ({
      id: d.id,
      serviceId: d.get("serviceId"),
      priceCents: d.get("priceCents") ?? 0,
      offerExpiresAt: d.get("offerExpiresAt") ?? 0,
      ...(d.get("queuedAt")
        ? { queuedWaitMs: Math.max(0, now - (d.get("queuedAt") as number)) }
        : {}),
    }));
}

/** A nurse declines their current offer; advance to the next nurse. */
export async function declineLiveRequest(
  liveRequestId: string,
  providerId: string,
): Promise<void> {
  const reqRef = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists || snap.get("status") !== "searching") return;
    if (snap.get("offeredTo") !== providerId) return;
    const declined = new Set<string>(snap.get("declinedBy") ?? []);
    declined.add(providerId);
    tx.update(reqRef, {
      declinedBy: [...declined],
      offeredTo: null,
      offerExpiresAt: null,
      updatedAt: Date.now(),
    });
  });
  await orchestrateLiveRequest(liveRequestId);
}

/**
 * A provider accepts a searching live request. Atomic: the first nurse to
 * accept wins; others get "taken". Creates the in-progress visit + payment and
 * marks the nurse busy.
 */
export async function acceptLiveRequest(
  liveRequestId: string,
  providerId: string,
): Promise<AcceptResult> {
  const reqRef = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  const presRef = adminDb.collection(COLLECTIONS.presence).doc(providerId);
  let result: AcceptResult = { ok: false, reason: "error" };
  let queuedProviderId: string | null = null;

  await adminDb.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      result = { ok: false, reason: "not_found" };
      return;
    }
    const req = reqSnap.data()!;
    if (req.status === "matched" && req.providerId === providerId) {
      result = { ok: true, appointmentId: req.appointmentId };
      return;
    }
    if (req.status !== "searching") {
      result = { ok: false, reason: "taken" };
      return;
    }
    const now = Date.now();
    // Only the nurse currently being pinged may accept, within their window.
    if (req.offeredTo !== providerId || (req.offerExpiresAt ?? 0) <= now) {
      result = { ok: false, reason: "taken" };
      return;
    }

    const presSnap = await tx.get(presRef);
    if (
      !presSnap.exists ||
      presSnap.get("online") !== true ||
      presSnap.get("busy") === true ||
      !isFresh(presSnap.get("lastSeenAt"), now)
    ) {
      result = { ok: false, reason: "not_available" };
      return;
    }
    const conditions: ServiceType[] = presSnap.get("conditions") ?? [];
    if (!conditions.includes(req.serviceId)) {
      result = { ok: false, reason: "not_eligible" };
      return;
    }

    const service = getService(req.serviceId as ServiceType);
    const durationMs = (service?.durationMinutes ?? 15) * 60 * 1000;
    const apptRef = adminDb.collection(COLLECTIONS.appointments).doc();
    const intakeRef = adminDb.collection(COLLECTIONS.intakeResponses).doc();
    const paymentRef = adminDb.collection(COLLECTIONS.payments).doc();

    tx.update(presRef, { busy: true, updatedAt: now });
    tx.set(apptRef, {
      id: apptRef.id,
      clientId: req.clientId,
      providerId,
      serviceId: req.serviceId,
      start: now,
      end: now + durationMs,
      status: "in_progress",
      isLive: true,
      liveRequestId,
      priceCents: req.priceCents,
      platformFeeCents: req.platformFeeCents ?? 0,
      paymentId: paymentRef.id,
      stripePaymentIntentId: req.stripePaymentIntentId ?? `dev_${apptRef.id}`,
      intakeId: intakeRef.id,
      videoRoomId: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    tx.set(intakeRef, {
      id: intakeRef.id,
      appointmentId: apptRef.id,
      clientId: req.clientId,
      providerId,
      serviceId: req.serviceId,
      answers: req.intake ?? {},
      photoPaths: req.photoPaths ?? [],
      createdAt: now,
    });
    tx.set(paymentRef, {
      id: paymentRef.id,
      appointmentId: apptRef.id,
      clientId: req.clientId,
      providerId,
      amountCents: req.priceCents,
      platformFeeCents: req.platformFeeCents ?? 0,
      currency: "usd",
      stripePaymentIntentId: req.stripePaymentIntentId ?? `dev_${apptRef.id}`,
      status: "succeeded",
      refundedCents: 0,
      createdAt: now,
      updatedAt: now,
    });
    tx.update(reqRef, {
      status: "matched",
      providerId,
      appointmentId: apptRef.id,
      matchedAt: now,
      offeredTo: null,
      offerExpiresAt: null,
      updatedAt: now,
    });
    queuedProviderId = req.queuedProviderId ?? null;

    result = { ok: true, appointmentId: apptRef.id };
  });

  // Everyone behind them moves up a place.
  if (result.ok && queuedProviderId) {
    await recomputeQueueForProvider(queuedProviderId).catch(() => {});
  }

  return result;
}

/**
 * Marks a provider free again (after a live visit ends) and immediately runs
 * the queue so the next patient in their line rings.
 */
export async function freeProvider(providerId: string): Promise<void> {
  await onProviderFreed(providerId);
}
