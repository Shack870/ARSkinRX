"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/datetime";
import type { AvailabilityWindow } from "@/lib/types";

export interface CalendarEvent {
  id: string;
  start: number;
  end: number;
  title: string;
  subtitle?: string;
  status: string;
  href?: string;
}

interface Props {
  events: CalendarEvent[];
  windows?: AvailabilityWindow[];
  timezone?: string;
  blackoutDates?: string[];
}

const DAY_MS = 24 * 60 * 60_000;
const PX_PER_MIN = 1.1;

const STATUS_CLS: Record<string, string> = {
  booked: "bg-[var(--primary)] text-white border-[var(--primary)]",
  in_progress: "bg-[var(--accent)] text-white border-[var(--accent)]",
  completed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  no_show: "bg-amber-100 text-amber-900 border-amber-200",
  rescheduled: "bg-slate-100 text-slate-700 border-slate-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

function startOfWeek(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

/** Minutes that `tz` is ahead of UTC at `date`. */
function tzOffsetMin(date: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour % 24,
    +parts.minute,
    +parts.second,
  );
  return (asUtc - date.getTime()) / 60_000;
}

/** Absolute ms for "HH:mm" on a given local calendar day, interpreted in `tz`. */
function windowToMs(dayStart: number, hhmm: string, tz: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dayStart);
  const naiveUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  return naiveUtc - tzOffsetMin(new Date(naiveUtc), tz) * 60_000;
}

function isoDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WeekCalendar({
  events,
  windows = [],
  timezone = "America/Chicago",
  blackoutDates = [],
}: Props) {
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(Date.now()));
  const [today] = React.useState(() => isoDate(Date.now()));
  const days = Array.from({ length: 7 }, (_, i) => weekStart + i * DAY_MS);

  // Grid hours: cover availability + visible events with a little padding.
  const { startHour, endHour } = React.useMemo(() => {
    let lo = 9;
    let hi = 17;
    for (const w of windows) {
      lo = Math.min(lo, Number(w.startTime.split(":")[0]));
      hi = Math.max(hi, Math.ceil(Number(w.endTime.split(":")[0]) + (w.endTime.endsWith(":00") ? 0 : 1)));
    }
    for (const e of events) {
      if (e.start < weekStart || e.start >= weekStart + 7 * DAY_MS) continue;
      lo = Math.min(lo, new Date(e.start).getHours());
      hi = Math.max(hi, new Date(e.end).getHours() + 1);
    }
    return { startHour: Math.max(0, lo - 1), endHour: Math.min(24, hi + 1) };
  }, [windows, events, weekStart]);

  const totalMin = (endHour - startHour) * 60;
  const gridH = totalMin * PX_PER_MIN;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const yFor = (ms: number, dayStart: number) => {
    const mins = (ms - dayStart) / 60_000 - startHour * 60;
    return Math.max(0, Math.min(gridH, mins * PX_PER_MIN));
  };

  const weekLabel = `${new Date(weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(weekStart + 6 * DAY_MS).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => w - 7 * DAY_MS)} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(Date.now()))}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => w + 7 * DAY_MS)} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-medium">{weekLabel}</p>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
        <div className="min-w-[760px]">
          {/* Day headers */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-[var(--border)] bg-[var(--muted)] text-xs">
            <div />
            {days.map((d) => {
              const iso = isoDate(d);
              const blackout = blackoutDates.includes(iso);
              return (
                <div
                  key={d}
                  className={`border-l border-[var(--border)] px-2 py-2 text-center ${iso === today ? "font-semibold text-[var(--primary)]" : ""}`}
                >
                  <div>{new Date(d).toLocaleDateString("en-US", { weekday: "short" })}</div>
                  <div className="text-base leading-tight">{new Date(d).getDate()}</div>
                  {blackout && <div className="text-[10px] text-amber-700">Blocked</div>}
                </div>
              );
            })}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: gridH }}>
            {/* Hour gutter */}
            <div className="relative">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]"
                  style={{ top: (h - startHour) * 60 * PX_PER_MIN }}
                >
                  {h === 0 || h === 24 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
                </div>
              ))}
            </div>

            {days.map((dayStart) => {
              const weekday = new Date(dayStart).getDay();
              const iso = isoDate(dayStart);
              const blackout = blackoutDates.includes(iso);
              const dayWindows = blackout ? [] : windows.filter((w) => w.weekday === weekday);
              const dayEvents = events.filter(
                (e) => e.start >= dayStart && e.start < dayStart + DAY_MS,
              );
              return (
                <div key={dayStart} className="relative border-l border-[var(--border)]">
                  {/* hour lines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-[var(--border)]/60"
                      style={{ top: (h - startHour) * 60 * PX_PER_MIN }}
                    />
                  ))}
                  {/* availability shading */}
                  {dayWindows.map((w, i) => {
                    const s = windowToMs(dayStart, w.startTime, timezone);
                    const e = windowToMs(dayStart, w.endTime, timezone);
                    const top = yFor(s, dayStart);
                    const h = Math.max(0, yFor(e, dayStart) - top);
                    return (
                      <div
                        key={i}
                        className="absolute inset-x-0 bg-[var(--primary-soft)]/50"
                        style={{ top, height: h }}
                        title={`Available ${w.startTime}–${w.endTime}`}
                      />
                    );
                  })}
                  {/* events */}
                  {dayEvents.map((ev) => {
                    const top = yFor(ev.start, dayStart);
                    const h = Math.max(22, yFor(ev.end, dayStart) - top);
                    const cls = STATUS_CLS[ev.status] ?? STATUS_CLS.booked;
                    const inner = (
                      <>
                        <div className="truncate font-medium leading-tight">{ev.title}</div>
                        <div className="truncate opacity-90">
                          {formatTime(ev.start)}
                          {ev.subtitle ? ` · ${ev.subtitle}` : ""}
                        </div>
                      </>
                    );
                    const common = `absolute inset-x-0.5 overflow-hidden rounded-[6px] border px-1.5 py-1 text-[11px] shadow-sm ${cls}`;
                    return ev.href ? (
                      <Link key={ev.id} href={ev.href} className={common} style={{ top, height: h }}>
                        {inner}
                      </Link>
                    ) : (
                      <div key={ev.id} className={common} style={{ top, height: h }}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[var(--primary-soft)]" /> Available hours
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[var(--primary)]" /> Booked
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-emerald-200" /> Completed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-amber-200" /> No-show
        </span>
        {windows.length === 0 && (
          <span className="ml-auto italic">No weekly hours posted yet.</span>
        )}
      </div>
    </div>
  );
}
