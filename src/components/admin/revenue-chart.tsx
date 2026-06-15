"use client";

import { formatCurrency } from "@/lib/utils";

/** Lightweight daily revenue bar chart (no chart library). */
export function RevenueChart({
  series,
}: {
  series: { date: number; grossCents: number }[];
}) {
  if (!series.length) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
        No revenue in this period.
      </p>
    );
  }

  const max = Math.max(...series.map((s) => s.grossCents), 1);
  const total = series.reduce((sum, s) => sum + s.grossCents, 0);
  const fmtDay = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  // Label roughly 5 evenly-spaced ticks.
  const step = Math.max(1, Math.ceil(series.length / 5));

  return (
    <div>
      <p className="mb-3 text-sm text-[var(--muted-foreground)]">
        {formatCurrency(total)} across {series.length} day
        {series.length > 1 ? "s" : ""}
      </p>
      <div className="flex h-40 items-end gap-px">
        {series.map((s) => (
          <div
            key={s.date}
            className="group relative flex-1"
            style={{ height: "100%" }}
          >
            <div
              className="absolute bottom-0 w-full rounded-t-sm bg-[var(--primary)] transition-colors group-hover:bg-[var(--accent)]"
              style={{
                height: `${Math.max((s.grossCents / max) * 100, s.grossCents > 0 ? 4 : 0)}%`,
              }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--foreground)] px-2 py-1 text-xs text-[var(--background)] opacity-0 transition-opacity group-hover:opacity-100">
              {fmtDay(s.date)}: {formatCurrency(s.grossCents)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-[var(--muted-foreground)]">
        {series
          .filter((_, i) => i % step === 0)
          .map((s) => (
            <span key={s.date}>{fmtDay(s.date)}</span>
          ))}
      </div>
    </div>
  );
}
