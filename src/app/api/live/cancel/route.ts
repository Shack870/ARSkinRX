import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { refundLiveRequest } from "@/lib/refunds-server";
import { recomputeQueueForProvider } from "@/lib/live-queue";

/**
 * POST /api/live/cancel { liveRequestId }
 * Patient stops searching / leaves the line. If they'd already paid and were
 * never seen (searching or queued), the full amount is refunded automatically
 * and recorded on the request.
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
  const status = snap.get("status");
  if (status === "matched") {
    return NextResponse.json(
      { error: "You've already been matched." },
      { status: 409 },
    );
  }
  if (status === "cancelled" || status === "expired" || status === "converted") {
    return NextResponse.json({
      ok: true,
      status,
      refundedCents: snap.get("refundedCents") ?? 0,
    });
  }

  const paid = status === "searching" || status === "queued";
  const now = Date.now();
  await ref.update({
    status: "cancelled",
    cancelledAt: now,
    refundEligible: paid,
    offeredTo: null,
    offerExpiresAt: null,
    updatedAt: now,
  });

  let refundedCents = 0;
  if (paid) {
    try {
      const r = await refundLiveRequest(liveRequestId, {
        reason: "patient_cancelled_before_visit",
        actorId: user.uid,
      });
      refundedCents = r.amountCents;
    } catch (err) {
      console.error("[live/cancel] refund failed", liveRequestId, err);
    }
    const nurse = snap.get("queuedProviderId") as string | null;
    if (nurse) await recomputeQueueForProvider(nurse).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: "cancelled", refundedCents });
}
