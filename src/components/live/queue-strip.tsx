"use client";

import * as React from "react";
import { CalendarClock, Users } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatTime } from "@/lib/datetime";
import { SERVICE_MAP } from "@/lib/services";

export interface QueueView {
  count: number;
  items: Array<{
    id: string;
    serviceId: string;
    position: number;
    queuedAt: number;
    waitMs: number;
    estimateAt: number;
  }>;
  nextScheduled: { id: string; start: number; name: string } | null;
  canStartNext: boolean;
}

const POLL_MS = 8000;

/**
 * Polls the signed-in nurse's line (GET /api/live/queue). Returns null until
 * the first response. Only runs for providers; pass `enabled=false` to pause.
 */
export function useLiveQueue(enabled = true): QueueView | null {
  const { user, role } = useAuth();
  const [view, setView] = React.useState<QueueView | null>(null);
  const active = enabled && !!user && role === "provider";

  React.useEffect(() => {
    if (!active) return;
    let alive = true;
    const poll = () =>
      authedFetch("/api/live/queue")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d) setView(d as QueueView);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);

  return active ? view : null;
}

function waitLabel(ms: number) {
  const m = Math.round(ms / 60_000);
  return m < 1 ? "<1 min" : `${m} min`;
}

/**
 * One-line status for nurses: "In queue: 2 · Next scheduled: 2:30 PM Jane D."
 * Mounted at the top of the provider overview and inside the visit room.
 */
export function QueueStrip({
  view: external,
  compact = false,
  className = "",
}: {
  /** Pass a view from useLiveQueue to share one poller; otherwise it polls itself. */
  view?: QueueView | null;
  compact?: boolean;
  className?: string;
}) {
  const own = useLiveQueue(external === undefined);
  const view = external === undefined ? own : external;
  if (!view) return null;

  const head = view.items[0];
  const tone =
    view.count > 0
      ? "border-[#d4af37]/60 bg-[#fbf6e3] text-[#5b4a0f]"
      : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-md)] border px-3 ${
        compact ? "py-1.5 text-xs" : "py-2 text-sm"
      } ${tone} ${className}`}
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Users className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        In queue: {view.count}
        {head && (
          <span className="font-normal opacity-80">
            {" "}
            · next: {SERVICE_MAP[head.serviceId as keyof typeof SERVICE_MAP]?.name ?? head.serviceId}
            , waiting {waitLabel(head.waitMs)}
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {view.nextScheduled
          ? `Next scheduled: ${formatTime(view.nextScheduled.start)} ${view.nextScheduled.name}`
          : "No scheduled visits coming up"}
      </span>
    </div>
  );
}
