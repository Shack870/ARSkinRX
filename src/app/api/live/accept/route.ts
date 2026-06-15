import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { acceptLiveRequest } from "@/lib/live-server";

/**
 * POST /api/live/accept { liveRequestId }
 * The provider accepts a live request. First to accept wins.
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user || user.role !== "provider") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { liveRequestId } = await req.json().catch(() => ({}));
  if (!liveRequestId) {
    return NextResponse.json({ error: "Missing liveRequestId" }, { status: 400 });
  }

  const result = await acceptLiveRequest(liveRequestId, user.uid);
  if (!result.ok) {
    const status =
      result.reason === "taken" || result.reason === "expired" ? 409 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "live.accept",
    targetType: "appointment",
    targetId: result.appointmentId,
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, appointmentId: result.appointmentId });
}
