"use client";

import * as React from "react";
import { Loader2, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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

/**
 * Premium "Live Connect" funnel card for the time-selection screen. Rotates
 * through the nurses who treat the selected condition to encourage the
 * on-demand option. The button starts the No-Wait Live flow.
 */
export function LiveConnectCard({
  providers,
  available,
  priceCents,
  starting,
  onStart,
}: {
  providers: MiniProvider[];
  available: boolean;
  priceCents: number;
  starting: boolean;
  onStart: () => void;
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

  const current = providers[idx % Math.max(providers.length, 1)];

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

      {/* Rotating nurse profile */}
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
          {available && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {current?.displayName ?? "ARSkinRX nurses"}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {available
              ? "Available now for live visits"
              : providers.length > 0
                ? `${providers.length} nurse${providers.length > 1 ? "s" : ""} treat this`
                : "Licensed Arkansas nurse practitioners"}
          </p>
        </div>
      </div>

      <button
        onClick={onStart}
        disabled={starting}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-gradient-to-br from-[#d4af37] to-[#b8860b] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-70"
      >
        {starting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Zap className="h-5 w-5" />
        )}
        Live Connect — {formatCurrency(priceCents)}
      </button>
      {!available && (
        <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
          If no nurse is live this moment, we&apos;ll let you schedule below.
        </p>
      )}
    </div>
  );
}
