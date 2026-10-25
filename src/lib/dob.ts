/** Date-of-birth helpers. DOB is stored as an ISO date string "YYYY-MM-DD". */

export const MIN_PATIENT_AGE = 18;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "YYYY-MM-DD" into [year, month(1-12), day] or null if malformed/invalid. */
export function parseDob(dob: string | undefined | null): [number, number, number] | null {
  if (!dob) return null;
  const m = ISO_DATE.exec(dob.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return [y, mo, d];
}

/** Whole years old as of `today` (local date). Null when DOB is missing/invalid. */
export function ageFromDob(dob: string | undefined | null, today = new Date()): number | null {
  const parts = parseDob(dob);
  if (!parts) return null;
  const [y, mo, d] = parts;
  let age = today.getFullYear() - y;
  const hadBirthday =
    today.getMonth() + 1 > mo || (today.getMonth() + 1 === mo && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

export function isAdultDob(dob: string | undefined | null, today = new Date()): boolean {
  const age = ageFromDob(dob, today);
  return age !== null && age >= MIN_PATIENT_AGE;
}

/** "Mar 4, 1988" */
export function formatDob(dob: string | undefined | null): string {
  const parts = parseDob(dob);
  if (!parts) return "";
  const [y, mo, d] = parts;
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The latest DOB (ISO) that still counts as 18+ today — for <input max>. */
export function maxAdultDobIso(today = new Date()): string {
  const y = today.getFullYear() - MIN_PATIENT_AGE;
  const mo = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}
