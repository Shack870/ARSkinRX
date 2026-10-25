/**
 * Resolve the public origin to send a browser back to (Stripe return URLs,
 * emails). We prefer the origin the request actually came from so a session
 * created on arskinrx.com returns to arskinrx.com, not to the hosted.app alias
 * (where the user would have no auth session). Only allow-listed hosts are
 * honored; anything else falls back to NEXT_PUBLIC_APP_URL.
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://arskinrx.com";

const ALLOWED_HOSTS = new Set(
  [
    safeHost(APP_URL),
    "arskinrx.com",
    "www.arskinrx.com",
    "arskin--arskinrx.us-east4.hosted.app",
    process.env.NODE_ENV !== "production" ? "localhost:3000" : null,
  ].filter((h): h is string => Boolean(h)),
);

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function requestOrigin(req: Request): string {
  const candidates: string[] = [];
  const origin = req.headers.get("origin");
  if (origin) candidates.push(origin);
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      candidates.push(new URL(referer).origin);
    } catch {
      /* ignore */
    }
  }
  const fwdHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (fwdHost) {
    const proto =
      req.headers.get("x-forwarded-proto") ??
      (fwdHost.startsWith("localhost") ? "http" : "https");
    candidates.push(`${proto}://${fwdHost}`);
  }
  for (const c of candidates) {
    const host = safeHost(c);
    if (host && ALLOWED_HOSTS.has(host)) return `${new URL(c).protocol}//${host}`;
  }
  return APP_URL;
}
