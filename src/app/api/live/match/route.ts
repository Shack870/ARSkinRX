import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { orchestrateLiveRequest } from "@/lib/live-server";
import { tickLiveQueue } from "@/lib/live-queue";

/**
 * POST /api/live/match { liveRequestId }
 * Polled by the patient's "Looking for your nurse" / "You're in line" screen.
 * Drives the round-robin while searching (one 15s offer at a time, advancing
 * on timeout) and runs the queue while queued (rings a nurse who just freed
 * up, refreshes the estimate, re-homes or refunds if the nurse went offline).
 * Returns the current status.
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { liveRequestId } = await req.json().catch(() => ({}));
  if (!liveRequestId) {
    return NextResponse.json({ error: "Missing liveRequestId" }, { status: 400 });
  }

  const ref = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (snap.get("status") === "queued") {
    await tickLiveQueue();
    const after = await ref.get();
    return NextResponse.json({
      matched: after.get("status") === "matched",
      appointmentId: after.get("appointmentId"),
      status: after.get("status"),
      estimateAt: after.get("estimateAt") ?? null,
      position: after.get("position") ?? null,
    });
  }

  const result = await orchestrateLiveRequest(liveRequestId);
  return NextResponse.json({
    matched: result.status === "matched",
    appointmentId: result.appointmentId,
    status: result.status,
  });
}
