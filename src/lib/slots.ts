import type { AvailabilityWindow } from "@/lib/types";

export interface Slot {
  start: number;
  end: number;
}

/**
 * Returns the UTC epoch ms for a wall-clock time in a given IANA timezone.
 * Handles DST by computing the zone's offset for that instant. Good enough for
 * single-region (Arkansas / America/Chicago) scheduling.
 */
function zonedWallTimeToUtc(
  year: number,
  month: number, // 0-indexed
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const asUtc = Date.UTC(year, month, day, hour, minute);
  const local = new Date(asUtc).toLocaleString("en-US", { timeZone });
  const back = new Date(local).getTime();
  const offset = back - asUtc;
  return asUtc - offset;
}

function parseHHMM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h || 0, m || 0];
}

interface BusyRange {
  start: number;
  end: number;
}

/**
 * Generates bookable slots for a provider across the next `daysAhead` days,
 * based on weekly availability windows, excluding any times that overlap busy
 * ranges (existing appointments / holds) and any slots that start too soon.
 */
export function generateSlots(opts: {
  windows: AvailabilityWindow[];
  timeZone: string;
  durationMinutes: number;
  busy: BusyRange[];
  blackoutDates?: string[];
  daysAhead?: number;
  minLeadMinutes?: number;
  now?: number;
}): Slot[] {
  const {
    windows,
    timeZone,
    durationMinutes,
    busy,
    blackoutDates = [],
    daysAhead = 14,
    minLeadMinutes = 60,
    now = Date.now(),
  } = opts;
  const blackout = new Set(blackoutDates);

  if (!windows?.length) return [];
  const stepMs = durationMinutes * 60 * 1000;
  const earliest = now + minLeadMinutes * 60 * 1000;
  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const base = new Date(now + dayOffset * 24 * 60 * 60 * 1000);
    // Determine the weekday in the provider's timezone.
    const weekday = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: undefined,
      }).format(base) && base.getDay(),
    );
    // Use the date parts in the provider tz for accuracy.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(base);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const mo = Number(parts.find((p) => p.type === "month")?.value) - 1;
    const d = Number(parts.find((p) => p.type === "day")?.value);
    const wdName = parts.find((p) => p.type === "weekday")?.value ?? "";
    const wdMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const zonedWeekday = wdMap[wdName] ?? weekday;

    // Skip provider time-off (blackout) dates.
    const dateStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (blackout.has(dateStr)) continue;

    const dayWindows = windows.filter((w) => w.weekday === zonedWeekday);
    for (const w of dayWindows) {
      const [sh, sm] = parseHHMM(w.startTime);
      const [eh, em] = parseHHMM(w.endTime);
      const windowStart = zonedWallTimeToUtc(y, mo, d, sh, sm, timeZone);
      const windowEnd = zonedWallTimeToUtc(y, mo, d, eh, em, timeZone);
      for (let t = windowStart; t + stepMs <= windowEnd + 1; t += stepMs) {
        const slotEnd = t + stepMs;
        if (t < earliest) continue;
        const overlaps = busy.some((b) => t < b.end && slotEnd > b.start);
        if (overlaps) continue;
        slots.push({ start: t, end: slotEnd });
      }
    }
  }

  return slots.sort((a, b) => a.start - b.start);
}
