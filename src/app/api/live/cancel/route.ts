import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";

/**
 * POST /api/live/cancel { liveRequestId }
 * Patient stops searching. If they'd already paid, the request is flagged
 * refund-eligible for an admin to process.
 */
export async function POST(
  req: Request,
) {
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
  const status = snap.get("status");
  if (status === "matched") {
    return NextResponse.json(
      { error: "You've already been matched." },
      { status: 409 },
    );
  }
  await ref.update({
    status: "cancelled",
    refundEligible: status === "searching",
    updatedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
