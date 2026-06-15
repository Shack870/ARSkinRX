import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Steps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                done && "bg-[var(--primary)] text-[var(--primary-foreground)]",
                active &&
                  "border-2 border-[var(--primary)] text-[var(--primary)]",
                !done &&
                  !active &&
                  "border border-[var(--border)] text-[var(--muted-foreground)]",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm sm:block",
                active ? "font-medium" : "text-[var(--muted-foreground)]",
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1 hidden h-px flex-1 bg-[var(--border)] sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
