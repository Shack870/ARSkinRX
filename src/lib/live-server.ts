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
  createdAt: number;
}

/**
 * Live requests that an online, eligible provider may accept right now:
 * searching, unexpired, and matching one of the provider's conditions.
 */
export async function incomingForProvider(
  providerId: string,
): Promise<LiveOffer[]> {
  const presSnap = await adminDb
    .collection(COLLECTIONS.presence)
    .doc(providerId)
    .get();
  const now = Date.now();
  if (
    !presSnap.exists ||
    presSnap.get("online") !== true ||
    presSnap.get("busy") === true ||
    !isFresh(presSnap.get("lastSeenAt"), now)
  ) {
    return [];
  }
  const conditions: ServiceType[] = presSnap.get("conditions") ?? [];
  if (!conditions.length) return [];

  const snap = await adminDb
    .collection(COLLECTIONS.liveRequests)
    .where("status", "==", "searching")
    .get();

  return snap.docs
    .filter(
      (d) =>
        conditions.includes(d.get("serviceId")) &&
        (!d.get("expiresAt") || d.get("expiresAt") > now),
    )
    .map((d) => ({
      id: d.id,
      serviceId: d.get("serviceId"),
      priceCents: d.get("priceCents") ?? 0,
      createdAt: d.get("createdAt") ?? 0,
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
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
    if (req.expiresAt && now > req.expiresAt) {
      result = { ok: false, reason: "expired" };
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
