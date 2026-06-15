import { NextResponse } from "next/server";
import { getEffectiveServices } from "@/lib/services-server";
import { rateLimit } from "@/lib/rate-limit";

/** GET /api/services — public effective catalog (code defaults + admin overrides). */
export async function GET(req: Request) {
  const limited = rateLimit(req, "services", 60);
  if (limited) return limited;
  const services = await getEffectiveServices();
  return NextResponse.json({ services });
}
