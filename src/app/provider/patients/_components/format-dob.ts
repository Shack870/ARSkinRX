/** "YYYY-MM-DD" → "MM/DD/YYYY" without timezone shifts. */
export function formatDob(dob: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return dob;
  return `${m[2]}/${m[3]}/${m[1]}`;
}
