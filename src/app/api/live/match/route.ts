import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { orchestrateLiveRequest } from "@/lib/live-server";

/**
 * POST /api/live/match { liveRequestId }
 * Polled by the patient's "Looking for your nurse" screen. Drives the
 * round-robin: keeps an active 15s offer to one nurse, advances on timeout,
 * and expires when nobody's left. Returns the current status.
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { liveRequestId } = await req.json().catch(() => ({}));
  if (!liveRequestId) {
    return NextResponse.json({ error: "Missing liveRequestId" }, { status: 400 });
  }

  const snap = await adminDb
    .collection(COLLECTIONS.liveRequests)
    .doc(liveRequestId)
    .get();
  if (!snap.exists || snap.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await orchestrateLiveRequest(liveRequestId);
  return NextResponse.json({
    matched: result.status === "matched",
    appointmentId: result.appointmentId,
    status: result.status,
  });
}
