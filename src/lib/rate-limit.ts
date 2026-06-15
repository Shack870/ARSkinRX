import { NextResponse } from "next/server";

/**
 * Best-effort in-memory rate limiter (sliding window) keyed by IP + bucket.
 * Good as a first line of defense against abuse/bursts. NOTE: in a
 * multi-instance serverless deployment each instance has its own memory, so
 * for hard guarantees back this with Redis/Upstash. For ARSkinRX's scale this
 * meaningfully throttles abuse without external infra.
 */
const hits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns a 429 response if the caller exceeded `limit` requests within
 * `windowMs`, otherwise null (allowed). Pass a stable `bucket` per route.
 */
export function rateLimit(
  req: Request,
  bucket: string,
  limit = 30,
  windowMs = 60_000,
): NextResponse | null {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);

  // Opportunistic cleanup to bound memory.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t > windowMs)) hits.delete(k);
    }
  }

  if (arr.length > limit) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } },
    );
  }
  return null;
}
