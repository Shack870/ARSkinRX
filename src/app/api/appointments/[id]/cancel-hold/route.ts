import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";

/**
 * POST /api/appointments/[id]/cancel-hold
 * Releases a still-unpaid hold so the slot frees up immediately (e.g. the
 * client backed out or changed their time before paying). Only the owning
 * client may release, and only while the appointment is pending_payment.
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
  if (!snap.exists || snap.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (snap.get("status") !== "pending_payment") {
    return NextResponse.json({ ok: true });
  }

  await ref.update({
    status: "cancelled",
    holdExpiresAt: null,
    updatedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
