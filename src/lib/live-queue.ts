import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { refundLiveRequest } from "@/lib/refunds-server";
import {
  LIVE_VISIT_MS,
  SCHEDULE_INSTEAD_WAIT_MS,
  canAdmitAt,
  canPopNow,
  projectTimeline,
  type NurseTimeline,
  type QueuedItem,
  type ScheduledBlock,
} from "@/lib/live-queue-math";
import type { LiveEstimate, ServiceType } from "@/lib/types";

/**
 * Queue + timeline engine for No-Wait Live visits.
 *
 * Lower layer than live-server.ts (which imports from here): owns the per-nurse
 * timeline projection, the "queued" status lifecycle, estimates, pops, and
 * refunds for patients who were never seen. Every entry point is idempotent and
 * safe to call from several pollers at once (pops happen in transactions).
 */

/** A heartbeat older than this means the provider has dropped from the pool. */
export const LIVE_FRESH_MS = 30 * 60 * 1000;
/** How long a single nurse has to respond to a round-robin offer. */
export const OFFER_TTL_MS = 15_000;
/** Don't re-ring the same free nurse for the same queued patient faster than this. */
export const POP_COOLDOWN_MS = 30_000;
/** After this many unanswered rings the nurse counts as having declined. */
export const MAX_POPS_BEFORE_DECLINE = 3;
/** Hard cap on how long a paid patient can sit in a line before auto-refund. */
export const LIVE_QUEUE_MAX_MS = 3 * 60 * 60 * 1000;
/** Only scheduled visits this far ahead matter for a projection. */
const HORIZON_MS = 12 * 60 * 60 * 1000;

export function isFresh(lastSeenAt: number | undefined, now: number): boolean {
  return !!lastSeenAt && lastSeenAt > now - LIVE_FRESH_MS;
}

type Snap = FirebaseFirestore.QueryDocumentSnapshot;

export interface PoolNurse {
  providerId: string;
  busy: boolean;
  conditions: ServiceType[];
  lastSeenAt: number;
  /** When the presence doc (incl. the busy flag) last changed. */
  updatedAt: number;
}

/** A `busy` flag older than this with no live visit behind it is stale. */
const STALE_BUSY_MS = 2 * LIVE_VISIT_MS;

/** Nurses currently in the live pool (online + fresh heartbeat). */
export async function loadPool(now = Date.now()): Promise<PoolNurse[]> {
  const snap = await adminDb
    .collection(COLLECTIONS.presence)
    .where("online", "==", true)
    .get();
  return snap.docs
    .filter((d) => isFresh(d.get("lastSeenAt"), now))
    .map((d) => ({
      providerId: d.id,
      busy: d.get("busy") === true,
      conditions: (d.get("conditions") ?? []) as ServiceType[],
      lastSeenAt: d.get("lastSeenAt") ?? 0,
      updatedAt: d.get("updatedAt") ?? 0,
    }));
}

const nameCache = new Map<string, string>();
export async function providerDisplayName(uid: string): Promise<string> {
  const cached = nameCache.get(uid);
  if (cached) return cached;
  const snap = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
  const name = (snap.get("displayName") as string | undefined) ?? "Your nurse";
  nameCache.set(uid, name);
  return name;
}

interface NurseInputs {
  scheduled: ScheduledBlock[];
  currentLive: { id: string; start: number; providerJoinedAt?: number | null } | null;
  queueDocs: Snap[];
}

async function loadNurseInputs(providerId: string, now: number): Promise<NurseInputs> {
  const [apptSnap, queueSnap] = await Promise.all([
    adminDb
      .collection(COLLECTIONS.appointments)
      .where("providerId", "==", providerId)
      .where("start", ">=", now - 3 * 60 * 60 * 1000)
      .get(),
    adminDb
      .collection(COLLECTIONS.liveRequests)
      .where("status", "==", "queued")
      .where("queuedProviderId", "==", providerId)
      .get(),
  ]);

  const scheduled: ScheduledBlock[] = [];
  let currentLive: NurseInputs["currentLive"] = null;
  for (const d of apptSnap.docs) {
    const status = d.get("status");
    if (status !== "booked" && status !== "in_progress") continue;
    const start = d.get("start") as number;
    const end = d.get("end") as number;
    if (start > now + HORIZON_MS) continue;
    if (d.get("isLive") === true) {
      if (status === "in_progress" && (!currentLive || start > currentLive.start)) {
        currentLive = {
          id: d.id,
          start,
          providerJoinedAt: d.get("joinedAt")?.provider ?? null,
        };
      }
      continue;
    }
    scheduled.push({ id: d.id, start, end, status });
  }

  return { scheduled, currentLive, queueDocs: queueSnap.docs };
}

function toQueueItems(docs: Snap[]): QueuedItem[] {
  return docs.map((d) => ({
    id: d.id,
    queuedAt: (d.get("queuedAt") as number | undefined) ?? d.get("createdAt") ?? 0,
  }));
}

export interface NurseProjection extends NurseTimeline {
  providerId: string;
  providerName: string;
  queueDocs: Snap[];
  /** The scheduled blocks the projection was built from (for admission checks). */
  scheduled: ScheduledBlock[];
}

/** Project a nurse's timeline (current visit, bookings, queued patients). */
export async function projectNurseTimeline(
  providerId: string,
  now = Date.now(),
): Promise<NurseProjection> {
  const [inputs, providerName] = await Promise.all([
    loadNurseInputs(providerId, now),
    providerDisplayName(providerId),
  ]);
  const tl = projectTimeline({
    now,
    scheduled: inputs.scheduled,
    currentLive: inputs.currentLive,
    queue: toQueueItems(inputs.queueDocs),
  });
  return {
    ...tl,
    providerId,
    providerName,
    queueDocs: inputs.queueDocs,
    scheduled: inputs.scheduled,
  };
}

/** Timelines for every pooled nurse who treats this service. */
export async function loadServiceTimelines(
  serviceId: ServiceType,
  now = Date.now(),
  pool?: PoolNurse[],
): Promise<Map<string, NurseProjection & { busyFlag: boolean }>> {
  const nurses = (pool ?? (await loadPool(now))).filter((n) =>
    n.conditions.includes(serviceId),
  );
  const out = new Map<string, NurseProjection & { busyFlag: boolean }>();
  await Promise.all(
    nurses.map(async (n) => {
      const tl = await projectNurseTimeline(n.providerId, now);
      if (n.busy && !tl.busyNow) {
        if (now - n.updatedAt > STALE_BUSY_MS) {
          // Self-heal: `busy` only means something during a live visit. A flag
          // this old with no in-progress live appointment behind it is a
          // leftover (e.g. a visit closed by the sweep instead of the nurse).
          n.busy = false;
          await adminDb
            .collection(COLLECTIONS.presence)
            .doc(n.providerId)
            .update({ busy: false, updatedAt: now })
            .catch(() => {});
        } else {
          // Presence "busy" is set the moment a live visit is accepted, before
          // the appointment doc is necessarily visible to our query — honor it.
          tl.busyNow = true;
          tl.busyUntil = Math.max(tl.busyUntil, now + LIVE_VISIT_MS);
          tl.currentVisitEndsAt = tl.currentVisitEndsAt ?? tl.busyUntil;
          if (tl.nextOpeningAt < tl.busyUntil) tl.nextOpeningAt = tl.busyUntil;
          if (tl.reason === "now") tl.reason = "busy";
        }
      }
      out.set(n.providerId, { ...tl, busyFlag: n.busy });
    }),
  );
  return out;
}

/**
 * Pre-payment projection: if a patient started a live request right now, how
 * long would they wait and behind whom?
 */
export async function estimateForNewRequest(
  serviceId: ServiceType,
  now = Date.now(),
): Promise<LiveEstimate> {
  const timelines = await loadServiceTimelines(serviceId, now);
  if (timelines.size === 0) {
    return {
      available: false,
      nurseCount: 0,
      bestWaitMs: 0,
      position: 0,
      nextOpeningAt: null,
      reason: "none",
    };
  }
  let best: (NurseProjection & { busyFlag: boolean }) | null = null;
  for (const tl of timelines.values()) {
    if (
      !best ||
      tl.nextOpeningAt < best.nextOpeningAt ||
      (tl.nextOpeningAt === best.nextOpeningAt && tl.queue.length < best.queue.length)
    ) {
      best = tl;
    }
  }
  const waitMs = Math.max(0, best!.nextOpeningAt - now);
  return {
    available: true,
    nurseCount: timelines.size,
    bestWaitMs: waitMs,
    position: best!.queue.length + 1,
    nextOpeningAt: best!.nextOpeningAt,
    reason: waitMs <= 0 ? "now" : best!.reason,
    providerId: best!.providerId,
    providerName: best!.providerName,
  };
}

/** Pick the nurse with the shortest projected wait (ties → shorter line). */
export function chooseQueueNurse(
  timelines: Map<string, NurseProjection>,
  exclude: Set<string> = new Set(),
): NurseProjection | null {
  let best: NurseProjection | null = null;
  for (const tl of timelines.values()) {
    if (exclude.has(tl.providerId)) continue;
    if (
      !best ||
      tl.nextOpeningAt < best.nextOpeningAt ||
      (tl.nextOpeningAt === best.nextOpeningAt && tl.queue.length < best.queue.length)
    ) {
      best = tl;
    }
  }
  return best;
}

/** Fields the patient screen renders, derived from a nurse's timeline. */
function projectionFields(tl: NurseProjection, id: string) {
  const mine = tl.queue.find((q) => q.id === id);
  return {
    position: mine?.position ?? tl.queue.length + 1,
    estimateAt: mine?.estimateStart ?? tl.nextOpeningAt,
    currentVisitEndsAt: tl.currentVisitEndsAt,
    nextScheduledStart: tl.nextScheduledStart,
    queuedProviderName: tl.providerName,
  };
}

/**
 * Re-derive position / estimateAt / currentVisitEndsAt for every patient in a
 * nurse's line and persist what changed, so the patient page can render from
 * a single onSnapshot. Returns the projection.
 */
export async function recomputeQueueForProvider(
  providerId: string,
  now = Date.now(),
): Promise<NurseProjection> {
  const tl = await projectNurseTimeline(providerId, now);
  const batch = adminDb.batch();
  let dirty = 0;
  for (const d of tl.queueDocs) {
    const next = projectionFields(tl, d.id);
    const changed =
      d.get("position") !== next.position ||
      // Estimates drift second by second while a visit runs; only write when
      // they move by more than 20s to keep snapshot churn down.
      Math.abs((d.get("estimateAt") ?? 0) - next.estimateAt) > 20_000 ||
      Math.abs((d.get("currentVisitEndsAt") ?? 0) - (next.currentVisitEndsAt ?? 0)) >
        20_000 ||
      (d.get("nextScheduledStart") ?? null) !== next.nextScheduledStart ||
      d.get("queuedProviderName") !== next.queuedProviderName;
    const queuedAt = (d.get("queuedAt") as number | undefined) ?? now;
    const longWait =
      next.estimateAt - now > SCHEDULE_INSTEAD_WAIT_MS ||
      now - queuedAt > SCHEDULE_INSTEAD_WAIT_MS;
    const offerSchedule = longWait && !d.get("waitOfferedScheduleAt");
    if (changed || offerSchedule) {
      batch.update(d.ref, {
        ...next,
        ...(offerSchedule ? { waitOfferedScheduleAt: now } : {}),
        updatedAt: now,
      });
      dirty++;
    }
  }
  if (dirty) await batch.commit();
  return tl;
}

/** Expire a never-seen paid request and refund it in full. */
export async function expireAndRefund(
  liveRequestId: string,
  reason: string,
): Promise<void> {
  const ref = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  const now = Date.now();
  let shouldRefund = false;
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const status = snap.get("status");
    if (status !== "queued" && status !== "searching") return;
    tx.update(ref, {
      status: "expired",
      refundEligible: true,
      expireReason: reason,
      offeredTo: null,
      offerExpiresAt: null,
      updatedAt: now,
    });
    shouldRefund = !!snap.get("stripePaymentIntentId");
  });
  if (shouldRefund) {
    try {
      await refundLiveRequest(liveRequestId, { reason });
    } catch (err) {
      console.error("[live-queue] auto-refund failed", liveRequestId, err);
    }
  }
}

/**
 * Pop one queued request into a 15s offer for `providerId` (transactional).
 * The request keeps its queuedProviderId/queuedAt so an unanswered ring puts
 * it back in the same place in line.
 */
export async function popToOffer(
  liveRequestId: string,
  providerId: string,
  now = Date.now(),
): Promise<boolean> {
  const ref = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  let ok = false;
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") !== "queued") return;
    const queuedAt = (snap.get("queuedAt") as number | undefined) ?? now;
    tx.update(ref, {
      status: "searching",
      offeredTo: providerId,
      offerExpiresAt: now + OFFER_TTL_MS,
      searchStartedAt: now,
      lastPoppedAt: now,
      popCount: (snap.get("popCount") ?? 0) + 1,
      queuedWaitMs: Math.max(0, now - queuedAt),
      updatedAt: now,
    });
    ok = true;
  });
  return ok;
}

/** Is this nurse already ringing for some request? */
async function hasActiveOffer(providerId: string, now: number): Promise<boolean> {
  const snap = await adminDb
    .collection(COLLECTIONS.liveRequests)
    .where("offeredTo", "==", providerId)
    .get();
  return snap.docs.some(
    (d) => d.get("status") === "searching" && (d.get("offerExpiresAt") ?? 0) > now,
  );
}

/**
 * One maintenance pass over every queued request:
 *  1. re-home (or expire + refund) patients whose nurse left the pool;
 *  2. expire + refund anyone who has waited past the hard cap;
 *  3. ring free, admissible nurses with the earliest-queued compatible patient;
 *  4. refresh the stored estimates for everyone still waiting.
 * Cheap when the queue is empty (one query). Called from the patient poll, the
 * nurse poll, complete/no-show, and the cron sweep.
 */
export async function tickLiveQueue(now = Date.now()): Promise<{
  queued: number;
  popped: number;
  expired: number;
}> {
  // Several pollers (every nurse's 2s incoming poll, every waiting patient's
  // 4s poll) call this; coalesce bursts within one server instance.
  if (now - lastTickAt < TICK_THROTTLE_MS) return lastTickResult;
  lastTickAt = now;
  const result = await tickLiveQueueNow(now);
  lastTickResult = result;
  return result;
}

const TICK_THROTTLE_MS = 1500;
let lastTickAt = 0;
let lastTickResult = { queued: 0, popped: 0, expired: 0 };

/** Un-throttled variant for events that must act immediately (nurse freed). */
export async function tickLiveQueueNow(now = Date.now()): Promise<{
  queued: number;
  popped: number;
  expired: number;
}> {
  const queuedSnap = await adminDb
    .collection(COLLECTIONS.liveRequests)
    .where("status", "==", "queued")
    .get();
  if (queuedSnap.empty) return { queued: 0, popped: 0, expired: 0 };

  const pool = await loadPool(now);
  const poolById = new Map(pool.map((n) => [n.providerId, n]));
  const timelineCache = new Map<ServiceType, Map<string, NurseProjection>>();
  const serviceTimelines = async (serviceId: ServiceType) => {
    let m = timelineCache.get(serviceId);
    if (!m) {
      m = await loadServiceTimelines(serviceId, now, pool);
      timelineCache.set(serviceId, m);
    }
    return m;
  };

  let expired = 0;
  let popped = 0;
  const live: Snap[] = [];

  // 1 + 2: validate each queued patient's nurse and age.
  for (const d of queuedSnap.docs) {
    const serviceId = d.get("serviceId") as ServiceType;
    const queuedAt = (d.get("queuedAt") as number | undefined) ?? d.get("createdAt") ?? now;
    if (now - queuedAt > LIVE_QUEUE_MAX_MS) {
      await expireAndRefund(d.id, "queue_timeout");
      expired++;
      continue;
    }
    const nurseId = d.get("queuedProviderId") as string | null;
    const nurse = nurseId ? poolById.get(nurseId) : undefined;
    const nurseOk = !!nurse && nurse.conditions.includes(serviceId);
    if (nurseOk) {
      live.push(d);
      continue;
    }
    // Nurse went offline/stale/ineligible → re-home to the best remaining nurse.
    const timelines = await serviceTimelines(serviceId);
    const next = chooseQueueNurse(timelines);
    if (!next) {
      await expireAndRefund(d.id, "nurse_offline");
      expired++;
      continue;
    }
    await d.ref.update({
      queuedProviderId: next.providerId,
      queuedProviderName: next.providerName,
      updatedAt: now,
    });
    timelineCache.clear();
    live.push(d);
  }

  // 3: ring free nurses. Earliest-queued compatible patient wins; a nurse's own
  //    line is preferred so positions stay meaningful.
  const byQueuedAt = [...live].sort(
    (a, b) =>
      ((a.get("queuedAt") as number) ?? 0) - ((b.get("queuedAt") as number) ?? 0),
  );
  const taken = new Set<string>();
  for (const nurse of pool) {
    const candidates = byQueuedAt.filter((d) => {
      if (taken.has(d.id)) return false;
      if (!nurse.conditions.includes(d.get("serviceId"))) return false;
      if ((d.get("declinedBy") ?? []).includes(nurse.providerId)) return false;
      const lastPopped = d.get("lastPoppedAt") as number | undefined;
      if (lastPopped && now - lastPopped < POP_COOLDOWN_MS) return false;
      return true;
    });
    if (candidates.length === 0) continue;
    // (loadServiceTimelines also self-heals a stale busy flag on `nurse`.)
    const timelines = await serviceTimelines(candidates[0].get("serviceId"));
    const tl = timelines.get(nurse.providerId);
    if (!tl || nurse.busy || tl.busyNow || !canAdmitAt(now, tl.scheduled)) continue;
    if (await hasActiveOffer(nurse.providerId, now)) continue;
    const own = candidates.find((d) => d.get("queuedProviderId") === nurse.providerId);
    const pick = own ?? candidates[0];
    if (await popToOffer(pick.id, nurse.providerId, now)) {
      taken.add(pick.id);
      popped++;
    }
  }

  // 4: refresh stored estimates for everyone still in a line.
  const nurses = new Set<string>();
  for (const d of live) {
    if (taken.has(d.id)) continue;
    const id = d.get("queuedProviderId") as string | null;
    if (id) nurses.add(id);
  }
  await Promise.all(
    [...nurses].map((id) => recomputeQueueForProvider(id, now).catch(() => {})),
  );

  return { queued: live.length - taken.size, popped, expired };
}

/**
 * The nurse just became free (live visit completed / scheduled visit closed):
 * clear the busy flag and immediately run the queue so the next patient rings.
 */
export async function onProviderFreed(providerId: string): Promise<void> {
  const ref = adminDb.collection(COLLECTIONS.presence).doc(providerId);
  if ((await ref.get()).exists) {
    await ref.update({ busy: false, updatedAt: Date.now() });
  }
  await tickLiveQueueNow().catch((err) =>
    console.error("[live-queue] tick after free failed", err),
  );
}

/** Could this nurse start the head of their line right now (admission rule)? */
export async function canStartNextNow(providerId: string): Promise<boolean> {
  const tl = await projectNurseTimeline(providerId);
  return canPopNow(tl);
}

export interface ProviderQueueView {
  count: number;
  items: Array<{
    id: string;
    serviceId: ServiceType;
    position: number;
    queuedAt: number;
    waitMs: number;
    estimateAt: number;
  }>;
  nextScheduled: { id: string; start: number; name: string } | null;
  /** True when the head of the line could start now under the admission rule. */
  canStartNext: boolean;
}

/** What a nurse sees in the queue strip. */
export async function queueForProvider(providerId: string): Promise<ProviderQueueView> {
  const now = Date.now();
  const tl = await projectNurseTimeline(providerId, now);
  const items = tl.queue.map((q) => {
    const d = tl.queueDocs.find((x) => x.id === q.id)!;
    const queuedAt = (d.get("queuedAt") as number) ?? d.get("createdAt") ?? now;
    return {
      id: q.id,
      serviceId: d.get("serviceId") as ServiceType,
      position: q.position,
      queuedAt,
      waitMs: Math.max(0, now - queuedAt),
      estimateAt: q.estimateStart,
    };
  });

  let nextScheduled: ProviderQueueView["nextScheduled"] = null;
  if (tl.nextScheduledStart !== null) {
    const apptSnap = await adminDb
      .collection(COLLECTIONS.appointments)
      .where("providerId", "==", providerId)
      .where("start", "==", tl.nextScheduledStart)
      .get();
    const appt = apptSnap.docs.find((d) =>
      ["booked", "in_progress"].includes(d.get("status")),
    );
    if (appt) {
      const patient = await adminDb
        .collection(COLLECTIONS.users)
        .doc(appt.get("clientId"))
        .get();
      nextScheduled = {
        id: appt.id,
        start: tl.nextScheduledStart,
        name: (patient.get("displayName") as string | undefined) ?? "Patient",
      };
    }
  }

  return {
    count: items.length,
    items,
    nextScheduled,
    canStartNext: canPopNow(tl),
  };
}

/**
 * Nurse-initiated pop (scheduled patient is late): take the earliest patient
 * compatible with this nurse off any line, ignoring the admission rule, and
 * put them straight into a 15s offer for this nurse. Returns the request id.
 */
export async function forcePopForProvider(
  providerId: string,
  conditions: ServiceType[],
): Promise<string | null> {
  const now = Date.now();
  const snap = await adminDb
    .collection(COLLECTIONS.liveRequests)
    .where("status", "==", "queued")
    .get();
  const docs = snap.docs
    .filter(
      (d) =>
        conditions.includes(d.get("serviceId")) &&
        !(d.get("declinedBy") ?? []).includes(providerId),
    )
    .sort((a, b) => {
      const ownA = a.get("queuedProviderId") === providerId ? 0 : 1;
      const ownB = b.get("queuedProviderId") === providerId ? 0 : 1;
      if (ownA !== ownB) return ownA - ownB;
      return ((a.get("queuedAt") as number) ?? 0) - ((b.get("queuedAt") as number) ?? 0);
    });
  for (const d of docs) {
    if (await popToOffer(d.id, providerId, now)) return d.id;
  }
  return null;
}
