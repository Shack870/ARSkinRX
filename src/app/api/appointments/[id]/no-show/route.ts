import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { tickLiveQueue } from "@/lib/live-queue";

/** Grace for clock skew so the nurse can close out right as the window ends. */
const END_SKEW_MS = 60 * 1000;

/**
 * POST /api/appointments/[id]/no-show
 * The provider (or an admin) marks the patient a no-show. Only allowed once the
 * full visit window has elapsed and the patient never joined — the nurse holds
 * the window open; no refund is issued for a missed visit. The scheduled sweep
 * does the same thing automatically, this just lets the nurse close out now.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ref = adminDb.collection(COLLECTIONS.appointments).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const a = snap.data()!;
  if (a.providerId !== user.uid && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["booked", "in_progress"].includes(a.status)) {
    return NextResponse.json({ error: "Visit is already closed." }, { status: 409 });
  }
  if (a.joinedAt?.client) {
    return NextResponse.json(
      { error: "The patient joined this visit; it can't be marked a no-show." },
      { status: 409 },
    );
  }
  const now = Date.now();
  if (now < a.end - END_SKEW_MS) {
    return NextResponse.json(
      { error: "Please hold the visit window open until it ends." },
      { status: 409 },
    );
  }

  await ref.update({
    status: "no_show",
    noShowParty: "client",
    updatedAt: now,
  });
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "appointment.no_show.provider",
    targetType: "appointment",
    targetId: id,
    meta: { clientId: a.clientId, providerId: a.providerId },
    timestamp: FieldValue.serverTimestamp(),
  });

  // The scheduled block is gone — let queued live patients move up / ring.
  await tickLiveQueue().catch(() => {});

  return NextResponse.json({ ok: true });
}
