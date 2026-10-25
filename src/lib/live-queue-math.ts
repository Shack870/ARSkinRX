/**
 * Pure timeline / admission math for the No-Wait Live queue.
 *
 * Deliberately dependency-free (no Firestore, no "server-only") so it can be
 * unit-tested in isolation and shared by the server engine and any UI that
 * wants to re-derive a projection from the same inputs.
 *
 * Model per nurse:
 *   - scheduled visits (status booked / in_progress, not live) block their
 *     [start, end) window; a window that has already begun blocks until `end`
 *     (the nurse holds the room open for a late patient).
 *   - the nurse's current live visit blocks until max(now, providerJoinedAt +
 *     LIVE_VISIT_MS) — i.e. a live visit is projected at 15 minutes from when
 *     the nurse actually joined, never in the past.
 *   - ADMISSION RULE: a live visit may start at T only if T + LIVE_VISIT_MS <=
 *     the next scheduled start for that nurse (no overlap with any booked
 *     window).
 */

/** Planning length of a live visit. */
export const LIVE_VISIT_MS = 15 * 60_000;
/** A scheduled patient this late lets the nurse start the next live visit. */
export const SCHEDULED_LATE_MS = 5 * 60_000;
/** Above this projected wait we offer "schedule instead" ($20 back). */
export const SCHEDULE_INSTEAD_WAIT_MS = 30 * 60_000;
/** Patients who take the schedule-instead fallback get this much back. */
export const SCHEDULE_INSTEAD_REFUND_CENTS = 2000;

export interface ScheduledBlock {
  id: string;
  start: number;
  end: number;
  status: "booked" | "in_progress";
}

export interface CurrentLiveVisit {
  id: string;
  start: number;
  providerJoinedAt?: number | null;
}

export interface QueuedItem {
  id: string;
  queuedAt: number;
}

export interface TimelineInputs {
  now: number;
  /** Non-live appointments for this nurse that still block time. */
  scheduled: ScheduledBlock[];
  /** The live visit the nurse is in right now, if any. */
  currentLive?: CurrentLiveVisit | null;
  /** Requests waiting in this nurse's line (any order). */
  queue: QueuedItem[];
}

export interface QueueProjection {
  id: string;
  position: number;
  estimateStart: number;
}

export interface NurseTimeline {
  now: number;
  /** Earliest moment the nurse is free of their current visit (>= now). */
  busyUntil: number;
  /** True while the nurse is in a live visit or an active scheduled window. */
  busyNow: boolean;
  /** Projected end of the nurse's current visit (live or scheduled), if any. */
  currentVisitEndsAt: number | null;
  /** Next scheduled (booked) start at or after now, if any. */
  nextScheduledStart: number | null;
  /** Queue, ordered by queuedAt, with projected starts. */
  queue: QueueProjection[];
  /** Earliest admissible start for one more live visit after the queue. */
  nextOpeningAt: number;
  /** Why the next opening isn't "now". */
  reason: "now" | "busy" | "scheduled_block";
}

function sortBlocks(blocks: ScheduledBlock[]): ScheduledBlock[] {
  return [...blocks].sort((a, b) => a.start - b.start);
}

/**
 * Admission rule: can a live visit start at `t` without colliding with any
 * scheduled block? (t + LIVE_VISIT_MS must not run into a booked window and
 * t must not sit inside one.)
 */
export function canAdmitAt(t: number, scheduled: ScheduledBlock[]): boolean {
  const end = t + LIVE_VISIT_MS;
  return !scheduled.some((s) => t < s.end && end > s.start);
}

/**
 * Earliest T >= from at which a live visit is admissible. Walks past any
 * scheduled block that would collide.
 */
export function nextAdmissibleStart(
  from: number,
  scheduled: ScheduledBlock[],
): number {
  const blocks = sortBlocks(scheduled);
  let t = from;
  // Bounded loop: each iteration jumps past one block.
  for (let i = 0; i <= blocks.length; i++) {
    const hit = blocks.find((s) => t < s.end && t + LIVE_VISIT_MS > s.start);
    if (!hit) return t;
    t = Math.max(t, hit.end);
  }
  return t;
}

export function projectTimeline(inputs: TimelineInputs): NurseTimeline {
  const { now } = inputs;
  const scheduled = sortBlocks(
    inputs.scheduled.filter((s) => s.end > now),
  );

  let busyUntil = now;
  let currentVisitEndsAt: number | null = null;
  let busyNow = false;

  if (inputs.currentLive) {
    const joined = inputs.currentLive.providerJoinedAt ?? inputs.currentLive.start;
    busyUntil = Math.max(now, joined + LIVE_VISIT_MS);
    currentVisitEndsAt = busyUntil;
    busyNow = true;
  }

  // A scheduled window that's already open blocks until it ends.
  const active = scheduled.find((s) => s.start <= now && s.end > now);
  if (active) {
    busyUntil = Math.max(busyUntil, active.end);
    currentVisitEndsAt = Math.max(currentVisitEndsAt ?? 0, active.end);
    busyNow = true;
  }

  const upcoming = scheduled.filter((s) => s.start >= now);
  const nextScheduledStart = upcoming.length ? upcoming[0].start : null;

  const ordered = [...inputs.queue].sort((a, b) => a.queuedAt - b.queuedAt);
  const queue: QueueProjection[] = [];
  let cursor = busyUntil;
  ordered.forEach((q, i) => {
    const start = nextAdmissibleStart(cursor, scheduled);
    queue.push({ id: q.id, position: i + 1, estimateStart: start });
    cursor = start + LIVE_VISIT_MS;
  });

  const nextOpeningAt = nextAdmissibleStart(cursor, scheduled);
  let reason: NurseTimeline["reason"] = "now";
  if (nextOpeningAt > now) {
    reason =
      busyNow || queue.length > 0 ? "busy" : "scheduled_block";
    // "busy" because of a queue only is still a wait behind people; if the
    // wait is purely a scheduled gate, say so.
    if (!busyNow && queue.length === 0) reason = "scheduled_block";
  }

  return {
    now,
    busyUntil,
    busyNow,
    currentVisitEndsAt,
    nextScheduledStart,
    queue,
    nextOpeningAt,
    reason,
  };
}

/**
 * Whether the head of the queue may be popped to this nurse right now: the
 * nurse must be free and a 15-minute visit must fit before the next booking.
 */
export function canPopNow(tl: NurseTimeline): boolean {
  if (tl.busyNow) return false;
  return tl.queue.length > 0 && tl.queue[0].estimateStart <= tl.now;
}

/** Ordinal label: 1 → "next", 2 → "2nd", 3 → "3rd", 4 → "4th"… */
export function ordinal(n: number): string {
  if (n <= 1) return "next";
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
