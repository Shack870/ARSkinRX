import { NextResponse } from "next/server";
import { getLivePriceCents } from "@/lib/live-server";
import { estimateForNewRequest } from "@/lib/live-queue";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType } from "@/lib/types";

/**
 * GET /api/live/availability?serviceId
 * Pre-payment projection for a No-Wait Live visit: is a nurse free right now,
 * or how long would the patient wait (behind whom / after which booking)?
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "live-availability", 120);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId") as ServiceType | null;
  const realtimePriceCents = await getLivePriceCents();
  if (!serviceId) {
    return NextResponse.json({
      available: false,
      count: 0,
      realtimePriceCents,
      estimate: null,
    });
  }
  const estimate = await estimateForNewRequest(serviceId);
  return NextResponse.json({
    // `available` keeps its original meaning for older clients: a nurse can
    // take the visit right now. The estimate carries the richer picture.
    available: estimate.reason === "now",
    count: estimate.nurseCount,
    realtimePriceCents,
    estimate,
  });
}
