/** Lightweight date/time helpers used across dashboards. */

export function isSameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function isToday(ms: number) {
  return isSameDay(ms, Date.now());
}

export function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(ms: number) {
  return `${formatDate(ms)} · ${formatTime(ms)}`;
}

/** "Today" / "Tomorrow" / "Mon, Jun 16" */
export function formatRelativeDay(ms: number) {
  if (isToday(ms)) return "Today";
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
  if (isSameDay(ms, tomorrow)) return "Tomorrow";
  return formatDate(ms);
}

/** Compact countdown like "2d 3h", "45m", "30s". */
export function formatCountdown(ms: number) {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
