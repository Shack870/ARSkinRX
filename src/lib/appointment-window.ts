import type { Appointment } from "@/lib/types";

/** Patients/providers can join this many ms before the scheduled start. */
export const JOIN_EARLY_MS = 5 * 60 * 1000;

export type WindowState =
  | "future" // more than 5 min away
  | "joinable" // within join window and not ended
  | "ended" // window passed
  | "done"; // completed/cancelled/no_show

export function windowState(appt: Appointment, now = Date.now()): WindowState {
  if (["completed", "cancelled", "no_show", "rescheduled"].includes(appt.status))
    return "done";
  if (now < appt.start - JOIN_EARLY_MS) return "future";
  if (now <= appt.end) return "joinable";
  return "ended";
}

export function isJoinable(appt: Appointment, now = Date.now()): boolean {
  if (!["booked", "in_progress"].includes(appt.status)) return false;
  return now >= appt.start - JOIN_EARLY_MS && now <= appt.end;
}

export function needsReschedule(appt: Appointment): boolean {
  return appt.status === "no_show" && !appt.rescheduledToId;
}
