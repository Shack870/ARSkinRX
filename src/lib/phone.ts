/**
 * US phone normalization. Accepts "(501) 555-0123", "501-555-0123",
 * "5015550123", "+1 501 555 0123", "1-501-555-0123" and returns E.164
 * ("+15015550123"), or null when it isn't a plausible 10-digit US number.
 */
export function normalizeUsPhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  // NANP: area code and exchange can't start with 0 or 1.
  if (/^[01]/.test(national) || /^[01]/.test(national.slice(3))) return null;
  return `+1${national}`;
}

/** "+15015550123" → "(501) 555-0123"; anything else is returned as-is. */
export function formatUsPhone(e164: string | undefined | null): string {
  if (!e164) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
