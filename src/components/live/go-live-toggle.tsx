"use client";

import { Radio, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePresence } from "@/components/live/presence-context";

/**
 * "Go Live" presence toggle for nurses. Backed by the layout-level
 * PresenceProvider, so live status (and the heartbeat) persists across every
 * provider page. Only approved providers can go live.
 */
export function GoLiveToggle() {
  const { online, busy, canGoLive, working, goLive, goOffline } = usePresence();

  return (
    <Card
      className={
        "p-5 transition-colors " +
        (online ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "")
      }
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Radio className="h-5 w-5" />
            {online && (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-emerald-400" />
            )}
          </span>
          <div>
            <p className="font-semibold">
              {busy
                ? "In a live visit"
                : online
                  ? "You're live"
                  : "Take real-time bookings"}
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              {online
                ? "Patients can connect with you instantly. Stay on the dashboard to remain live."
                : canGoLive
                  ? "Go live to accept No-Wait visits right now."
                  : "Approval required before you can go live."}
            </p>
          </div>
        </div>
        <button
          onClick={() => (online ? goOffline() : goLive())}
          disabled={!canGoLive || working}
          aria-pressed={online}
          className={
            "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
            (online ? "bg-[var(--primary)]" : "bg-[var(--border)]")
          }
        >
          <span
            className={
              "inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow transition-transform " +
              (online ? "translate-x-7" : "translate-x-1")
            }
          >
            {working && (
              <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
            )}
          </span>
        </button>
      </div>
    </Card>
  );
}
