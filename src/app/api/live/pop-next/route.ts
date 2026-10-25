import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { acceptLiveRequest } from "@/lib/live-server";
import { forcePopForProvider, isFresh } from "@/lib/live-queue";
import type { ServiceType } from "@/lib/types";

/**
 * POST /api/live/pop-next
 * The nurse chooses to start the next live patient in line now — e.g. a
 * scheduled patient is 5+ minutes late. Skips the admission rule (the nurse
 * is making the call), pops the earliest compatible queued patient into an
 * offer for this nurse and accepts it in one go. Returns the new appointment
 * id so the nurse can go straight into the room; the scheduled window stays
 * open.
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user || user.role !== "provider") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const pres = await adminDb.collection(COLLECTIONS.presence).doc(user.uid).get();
  if (
    !pres.exists ||
    pres.get("online") !== true ||
    !isFresh(pres.get("lastSeenAt"), now)
  ) {
    return NextResponse.json(
      { error: "Go live first to take patients from the line." },
      { status: 409 },
    );
  }
  if (pres.get("busy") === true) {
    return NextResponse.json(
      { error: "You're already in a live visit." },
      { status: 409 },
    );
  }
  const conditions = (pres.get("conditions") ?? []) as ServiceType[];

  const liveRequestId = await forcePopForProvider(user.uid, conditions);
  if (!liveRequestId) {
    return NextResponse.json({ error: "No one is waiting in line." }, { status: 404 });
  }

  const result = await acceptLiveRequest(liveRequestId, user.uid);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "error" }, { status: 409 });
  }

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "live.pop_next",
    targetType: "appointment",
    targetId: result.appointmentId,
    meta: { liveRequestId },
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    liveRequestId,
    appointmentId: result.appointmentId,
  });
}
