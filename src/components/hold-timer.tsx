"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Live countdown to a hold expiry (epoch ms). Calls onExpire once when it hits
 * zero. Turns red/urgent under a minute remaining.
 */
export function HoldTimer({
  expiresAt,
  onExpire,
  className,
}: {
  expiresAt: number;
  onExpire?: () => void;
  className?: string;
}) {
  const [now, setNow] = React.useState(Date.now());
  const fired = React.useRef(false);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, expiresAt - now);

  React.useEffect(() => {
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const urgent = remaining > 0 && remaining < 60000;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium",
        urgent
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "bg-[var(--primary-soft)] text-[var(--primary)]",
        className,
      )}
      role="timer"
      aria-live="polite"
    >
      <Clock className="h-4 w-4" />
      {remaining > 0 ? (
        <span>
          Spot held for{" "}
          <span className="font-mono tabular-nums">
            {mins}:{String(secs).padStart(2, "0")}
          </span>
        </span>
      ) : (
        <span>Hold expired</span>
      )}
    </div>
  );
}
