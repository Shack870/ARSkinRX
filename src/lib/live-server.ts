import "server-only";

import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import type { ServiceType } from "@/lib/types";

/** A heartbeat older than this means the provider has dropped from the pool. */
export const LIVE_FRESH_MS = 45_000;
/** How long a paid request keeps searching before it's considered expired. */
export const LIVE_SEARCH_MS = 120_000;
/** Default premium price for a No-Wait Live (no-appointment) visit. */
export const DEFAULT_LIVE_PRICE_CENTS = 7500;

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

export interface MatchResult {
  matched: boolean;
  appointmentId?: string;
  providerId?: string;
  status?: string;
}

/**
 * Atomically claims the first available nurse for a searching live request,
 * creating the in-progress visit. The transaction prevents two patients from
 * grabbing the same nurse.
 */
export async function tryMatchLiveRequest(
  liveRequestId: string,
): Promise<MatchResult> {
  const reqRef = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  let result: MatchResult = { matched: false };

  await adminDb.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) {
      result = { matched: false, status: "not_found" };
      return;
    }
    const req = reqSnap.data()!;
    if (req.status === "matched" && req.appointmentId) {
      result = { matched: true, appointmentId: req.appointmentId };
      return;
    }
    if (req.status !== "searching") {
      result = { matched: false, status: req.status };
      return;
    }

    const serviceId = req.serviceId as ServiceType;
    const candQ = adminDb
      .collection(COLLECTIONS.presence)
      .where("online", "==", true)
      .where("conditions", "array-contains", serviceId);
    const candSnap = await tx.get(candQ);

    const now = Date.now();
    const chosen = candSnap.docs
      .filter((d) => d.get("busy") !== true && isFresh(d.get("lastSeenAt"), now))
      .sort((a, b) => (a.get("lastSeenAt") ?? 0) - (b.get("lastSeenAt") ?? 0))[0];

    if (!chosen) {
      result = { matched: false, status: "searching" };
      return;
    }

    const service = getService(serviceId);
    const durationMs = (service?.durationMinutes ?? 15) * 60 * 1000;
    const apptRef = adminDb.collection(COLLECTIONS.appointments).doc();
    const intakeRef = adminDb.collection(COLLECTIONS.intakeResponses).doc();
    const paymentRef = adminDb.collection(COLLECTIONS.payments).doc();
    const providerId = chosen.id;

    // Writes (all reads above are complete).
    tx.update(chosen.ref, { busy: true, updatedAt: now });

    tx.set(apptRef, {
      id: apptRef.id,
      clientId: req.clientId,
      providerId,
      serviceId,
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
      serviceId,
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

    result = { matched: true, appointmentId: apptRef.id, providerId };
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
