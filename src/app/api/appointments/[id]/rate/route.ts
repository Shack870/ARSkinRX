import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";

/**
 * POST /api/appointments/[id]/rate { rating (1-5), comment? }
 * The patient rates a completed visit. Updates the provider's running average.
 * One rating per visit.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { rating, comment } = await req.json().catch(() => ({}));
  const value = Math.round(Number(rating));
  if (!Number.isFinite(value) || value < 1 || value > 5) {
    return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
  }

  const apptRef = adminDb.collection(COLLECTIONS.appointments).doc(id);
  const providerRef = (providerId: string) =>
    adminDb.collection(COLLECTIONS.providers).doc(providerId);

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(apptRef);
      if (!snap.exists || snap.get("clientId") !== user.uid) {
        throw new Error("NOT_FOUND");
      }
      if (snap.get("status") !== "completed") throw new Error("NOT_COMPLETED");
      if (snap.get("rating")) throw new Error("ALREADY_RATED");

      const providerId = snap.get("providerId");
      const pRef = providerRef(providerId);
      const pSnap = await tx.get(pRef);
      const count = pSnap.get("ratingCount") ?? 0;
      const avg = pSnap.get("ratingAvg") ?? 0;
      const newCount = count + 1;
      const newAvg = (avg * count + value) / newCount;

      tx.update(apptRef, {
        rating: value,
        ratedAt: Date.now(),
        ratingComment: comment ? String(comment).slice(0, 500) : null,
      });
      tx.update(pRef, {
        ratingCount: newCount,
        ratingAvg: Math.round(newAvg * 100) / 100,
        updatedAt: Date.now(),
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ERR";
    if (msg === "NOT_FOUND")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (msg === "NOT_COMPLETED")
      return NextResponse.json(
        { error: "You can only rate completed visits." },
        { status: 409 },
      );
    if (msg === "ALREADY_RATED")
      return NextResponse.json({ error: "Already rated." }, { status: 409 });
    throw e;
  }

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "visit.rate",
    targetType: "appointment",
    targetId: id,
    meta: { rating: value },
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
