"use client";

import * as React from "react";
import { CalendarPlus, Clock, Loader2, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import {
  SCHEDULE_INSTEAD_REFUND_CENTS,
  SCHEDULE_INSTEAD_WAIT_MS,
  ordinal,
} from "@/lib/live-queue-math";
import type { LiveEstimate } from "@/lib/types";

interface MiniProvider {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function minutesLabel(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  return `~${m} min`;
}

/** Human line for the projection, e.g. "In a visit — you'd be 2nd in line, ~20 min". */
export function describeEstimate(est: LiveEstimate | null | undefined): {
  headline: string;
  detail?: string;
  tone: "now" | "wait" | "long" | "none";
} {
  if (!est || !est.available) {
    return {
      headline: "No nurse is live right now",
      detail: "Pick a scheduled time below — same visit, lower price.",
      tone: "none",
    };
  }
  if (est.reason === "now" || est.bestWaitMs <= 30_000) {
    return { headline: "Available now", tone: "now" };
  }
  const first = (est.providerName ?? "Your nurse").split(" ")[0];
  const long = est.bestWaitMs > SCHEDULE_INSTEAD_WAIT_MS;
  if (est.reason === "scheduled_block" && est.nextOpeningAt) {
    return {
      headline: `Next opening ${formatTime(est.nextOpeningAt)}`,
      detail: `${first} has a scheduled visit first (${minutesLabel(est.bestWaitMs)}).`,
      tone: long ? "long" : "wait",
    };
  }
  return {
    headline: `${first} is in a visit — you'd be ${ordinal(est.position)} in line`,
    detail: `${minutesLabel(est.bestWaitMs)}${
      est.nextOpeningAt ? ` · around ${formatTime(est.nextOpeningAt)}` : ""
    }`,
    tone: long ? "long" : "wait",
  };
}

/**
 * Premium "Live Connect" funnel card for the time-selection screen. Rotates
 * through the nurses who treat the selected condition and shows the live
 * projection: available now, place in line + wait, or next opening after a
 * booking. When the wait tops 30 minutes, scheduling becomes the primary
 * action and the $20-back fallback is explained.
 */
export function LiveConnectCard({
  providers,
  available,
  estimate,
  priceCents,
  scheduledPriceCents,
  starting,
  onStart,
  onSchedule,
}: {
  providers: MiniProvider[];
  available: boolean;
  estimate?: LiveEstimate | null;
  priceCents: number;
  scheduledPriceCents?: number;
  starting: boolean;
  onStart: () => void;
  /** Scrolls to / reveals the scheduled slots. */
  onSchedule?: () => void;
}) {
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    if (providers.length <= 1) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % providers.length),
      2500,
    );
    return () => clearInterval(t);
  }, [providers.length]);

  // Prefer showing the nurse the projection is about.
  const featured =
    estimate?.providerId
      ? providers.find((p) => p.uid === estimate.providerId)
      : undefined;
  const current = featured ?? providers[idx % Math.max(providers.length, 1)];
  const desc = describeEstimate(estimate ?? (available ? { available: true, reason: "now", bestWaitMs: 0, nurseCount: 1, position: 1, nextOpeningAt: null } : null));
  const canStart = !!estimate?.available || available;
  const longWait = desc.tone === "long";
  const reachable = desc.tone !== "none";

  const liveBtnClass = longWait
    ? "mt-2 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-[#d4af37] bg-white/70 px-5 py-3 text-sm font-semibold text-[#8a6d12] transition-colors hover:bg-white disabled:opacity-60"
    : "mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-gradient-to-br from-[#d4af37] to-[#b8860b] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-70";

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border-2 border-[#d4af37] bg-gradient-to-br from-[#fbf6e3] to-[#f6edd2] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c9a227] px-2.5 py-1 text-xs font-semibold text-white">
          <Zap className="h-3.5 w-3.5" /> No appointment needed
        </span>
        <span className="text-right">
          <span className="block text-2xl font-bold leading-none text-[#9a7d18]">
            {formatCurrency(priceCents)}
          </span>
          <span className="text-[11px] text-[#9a7d18]/70">flat, live now</span>
        </span>
      </div>

      <h3 className="mt-3 text-lg font-semibold tracking-tight text-[var(--foreground)]">
        Live Connect
      </h3>
      <p className="text-sm text-[var(--muted-foreground)]">
        Skip the wait — connect by video with the next available nurse right now.
      </p>

      {/* Nurse + projection */}
      <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-md)] bg-white/70 p-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f3e7c2] text-sm font-semibold text-[#8a6d12]">
          {current?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.photoURL}
              alt={current.displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            initials(current?.displayName ?? "AR")
          )}
          {reachable && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                desc.tone === "now" ? "bg-emerald-500" : "bg-amber-400"
              }`}
            />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {current?.displayName ?? "ARSkinRX nurses"}
          </p>
          <p
            className={`flex items-start gap-1 text-xs ${
              desc.tone === "now"
                ? "text-emerald-700"
                : reachable
                  ? "text-[#8a6d12]"
                  : "text-[var(--muted-foreground)]"
            }`}
          >
            {desc.tone !== "now" && reachable && (
              <Clock className="mt-0.5 h-3 w-3 shrink-0" />
            )}
            <span>
              <span className="font-medium">{desc.headline}</span>
              {desc.detail ? <span className="block">{desc.detail}</span> : null}
              {!reachable && providers.length > 0 ? (
                <span className="block">
                  {providers.length} nurse{providers.length > 1 ? "s" : ""} treat this
                </span>
              ) : null}
            </span>
          </p>
        </div>
      </div>

      {longWait && onSchedule && (
        <button
          onClick={onSchedule}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-gradient-to-br from-[#d4af37] to-[#b8860b] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <CalendarPlus className="h-5 w-5" /> Schedule a visit
          {scheduledPriceCents ? ` — ${formatCurrency(scheduledPriceCents)}` : ""}
        </button>
      )}

      <button
        onClick={onStart}
        disabled={starting || !canStart}
        className={liveBtnClass}
      >
        {starting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Zap className="h-5 w-5" />
        )}
        {longWait ? "Wait in line anyway" : "Live Connect"} — {formatCurrency(priceCents)}
      </button>

      {longWait && (
        <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
          If you join the line and the wait stays over 30 minutes, you can switch to
          a scheduled time with {formatCurrency(SCHEDULE_INSTEAD_REFUND_CENTS)} back,
          or cancel for a full refund.
        </p>
      )}
      {!longWait && reachable && desc.tone === "wait" && (
        <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
          You&apos;ll hold a paid place in line and your video starts automatically.
          Cancel anytime before you&apos;re seen for a full refund.
        </p>
      )}
      {!reachable && (
        <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
          If no nurse is live this moment, we&apos;ll let you schedule below.
        </p>
      )}
    </div>
  );
}
