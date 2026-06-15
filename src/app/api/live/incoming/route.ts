import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/api-auth";
import { incomingForProvider } from "@/lib/live-server";

/**
 * GET /api/live/incoming
 * Live requests the calling (online, eligible) provider can accept right now.
 */
export async function GET(req: Request) {
  const user = await verifyBearer(req);
  if (!user || user.role !== "provider") {
    return NextResponse.json({ offers: [] });
  }
  const offers = await incomingForProvider(user.uid);
  return NextResponse.json({ offers });
}
