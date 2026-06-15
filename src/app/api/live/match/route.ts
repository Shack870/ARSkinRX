import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";

/**
 * POST /api/live/match { liveRequestId }
 * Polled by the patient's "Looking for your nurse" screen. It does NOT claim a
 * nurse (nurses accept offers themselves) — it just reports status and expires
 * the request if the search window has elapsed (payment becomes refund-eligible).
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
  if (lr.expiresAt && Date.now() > lr.expiresAt) {
    await ref.update({
      status: "expired",
      refundEligible: true,
      updatedAt: Date.now(),
    });
    return NextResponse.json({ matched: false, status: "expired" });
  }
  return NextResponse.json({ matched: false, status: "searching" });
}
