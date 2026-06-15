import "server-only";

import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import type { ServiceType } from "@/lib/types";

/** A heartbeat older than this means the provider has dropped from the pool.
 *  Wide enough that a backgrounded/frozen nurse tab (whose heartbeat the
 *  browser pauses) still counts as online; explicit "Go offline" and the
 *  search-timeout/incoming-prompt cover abandoned sessions. */
export const LIVE_FRESH_MS = 30 * 60 * 1000;
/** How long a paid request keeps searching before it's considered expired. */
export const LIVE_SEARCH_MS = 120_000;
/** How long a single nurse has to respond to a round-robin offer. */
export const OFFER_TTL_MS = 15_000;
/** Overall safety cap for a live request. */
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

function isFresh(lastSeenAt: number | undefined, now: number): boolean {
  return !!lastSeenAt && lastSeenAt > now - LIVE_FRESH_MS;
}

/** Count nurses currently available for a live visit in this service line. */
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
}

export interface OrchestrateResult {
  status: string;
  offeredTo?: string | null;
  appointmentId?: string;
}

/**
 * Round-robin driver. Ensures a searching request has exactly one active offer
 * to one nurse for up to 15s. On timeout, that nurse is marked declined and the
 * next eligible nurse is pinged. When nobody's left, the request expires.
 * Safe to call from multiple pollers (single transaction).
 */
export async function orchestrateLiveRequest(
  liveRequestId: string,
): Promise<OrchestrateResult> {
  const reqRef = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  let out: OrchestrateResult = { status: "searching" };

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

    // Overall safety cap.
    if (req.createdAt && now - req.createdAt > LIVE_MAX_MS) {
      tx.update(reqRef, {
        status: "expired",
        refundEligible: true,
        offeredTo: null,
        offerExpiresAt: null,
        updatedAt: now,
      });
      out = { status: "expired" };
      return;
    }

    // Current offer still active → leave it.
    if (req.offeredTo && (req.offerExpiresAt ?? 0) > now) {
      out = { status: "searching", offeredTo: req.offeredTo };
      return;
    }

    // Advance: the previous nurse declined (timed out).
    const declined = new Set<string>(req.declinedBy ?? []);
    if (req.offeredTo) declined.add(req.offeredTo);

    const candSnap = await tx.get(
      adminDb
        .collection(COLLECTIONS.presence)
        .where("online", "==", true)
        .where("conditions", "array-contains", req.serviceId),
    );
    const next = candSnap.docs
      .filter(
        (d) =>
          d.get("busy") !== true &&
          isFresh(d.get("lastSeenAt"), now) &&
          !declined.has(d.id),
      )
      .sort((a, b) => (a.get("lastSeenAt") ?? 0) - (b.get("lastSeenAt") ?? 0))[0];

    if (!next) {
      tx.update(reqRef, {
        status: "expired",
        refundEligible: true,
        offeredTo: null,
        offerExpiresAt: null,
        declinedBy: [...declined],
        updatedAt: now,
      });
      out = { status: "expired" };
      return;
    }

    tx.update(reqRef, {
      offeredTo: next.id,
      offerExpiresAt: now + OFFER_TTL_MS,
      declinedBy: [...declined],
      updatedAt: now,
    });
    out = { status: "searching", offeredTo: next.id };
  });

  return out;
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
      offeredTo: null,
      offerExpiresAt: null,
      updatedAt: now,
    });

    result = { ok: true, appointmentId: apptRef.id };
  });

  return result;
}

/** Marks a provider free again (e.g., after a live visit ends). */
export async function freeProvider(providerId: string): Promise<void> {
  const ref = adminDb.collection(COLLECTIONS.presence).doc(providerId);
  if ((await ref.get()).exists) {
    await ref.update({ busy: false, updatedAt: Date.now() });
  }
}
