import type { NotificationPrefs } from "@/lib/types";

/** Default: everything on. Patients opt out per item in their settings. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  receipt: true,
  reminder3Day: true,
  reminder1Day: true,
  reminderDayOf: true,
};

/** Merge a (possibly partial/absent) stored value with defaults. */
export function resolvePrefs(
  prefs?: Partial<NotificationPrefs> | null,
): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(prefs ?? {}) };
}

export const NOTIFICATION_OPTIONS: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}[] = [
  {
    key: "receipt",
    label: "Booking receipts",
    description: "A confirmation with your visit details right after you book.",
  },
  {
    key: "reminder3Day",
    label: "3 days before",
    description: "A heads-up a few days ahead of your visit.",
  },
  {
    key: "reminder1Day",
    label: "1 day before",
    description: "A reminder the day before your visit.",
  },
  {
    key: "reminderDayOf",
    label: "Day of the visit",
    description: "A reminder the morning of your visit.",
  },
];
