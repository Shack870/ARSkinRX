import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { tryMatchLiveRequest } from "@/lib/live-server";

/**
 * POST /api/live/match { liveRequestId }
 * Re-attempts matching for the caller's searching request. Called by the
 * "Looking for your nurse" screen on a short interval. Expires past the window.
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
  const lr = snap.data()!;

  if (lr.status === "matched") {
    return NextResponse.json({ matched: true, appointmentId: lr.appointmentId });
  }
  if (lr.status !== "searching") {
    return NextResponse.json({ matched: false, status: lr.status });
  }
  // Expire if the search window has elapsed (payment becomes refund-eligible).
  if (lr.expiresAt && Date.now() > lr.expiresAt) {
    await ref.update({
      status: "expired",
      refundEligible: true,
      updatedAt: Date.now(),
    });
    return NextResponse.json({ matched: false, status: "expired" });
  }

  const result = await tryMatchLiveRequest(liveRequestId);
  return NextResponse.json(result);
}
