import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/api-auth";
import { declineLiveRequest } from "@/lib/live-server";

/** POST /api/live/decline { liveRequestId } — nurse passes; ping the next one. */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user || user.role !== "provider") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { liveRequestId } = await req.json().catch(() => ({}));
  if (!liveRequestId) {
    return NextResponse.json({ error: "Missing liveRequestId" }, { status: 400 });
  }
  await declineLiveRequest(liveRequestId, user.uid);
  return NextResponse.json({ ok: true });
}
