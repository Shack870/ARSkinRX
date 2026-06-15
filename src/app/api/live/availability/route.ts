import { NextResponse } from "next/server";
import { countAvailableProviders, getLivePriceCents } from "@/lib/live-server";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType } from "@/lib/types";

/** GET /api/live/availability?serviceId — is a No-Wait nurse available now? */
export async function GET(req: Request) {
  const limited = rateLimit(req, "live-availability", 120);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId") as ServiceType | null;
  const realtimePriceCents = await getLivePriceCents();
  if (!serviceId) {
    return NextResponse.json({ available: false, count: 0, realtimePriceCents });
  }
  const count = await countAvailableProviders(serviceId);
  return NextResponse.json({
    available: count > 0,
    count,
    realtimePriceCents,
  });
}
