import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { JOIN_EARLY_MS } from "@/lib/appointment-window";

/**
 * POST /api/appointments/[id]/join
 * Records that the caller (client or provider) joined the visit and moves the
 * appointment to in_progress. Only the two participants may join, and only
 * inside the visit window.
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
  const isClient = a.clientId === user.uid;
  const isProvider = a.providerId === user.uid;
  if (!isClient && !isProvider) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  if (now < a.start - JOIN_EARLY_MS || now > a.end) {
    return NextResponse.json(
      { error: "Visit window is not open." },
      { status: 409 },
    );
  }
  if (["completed", "cancelled", "no_show"].includes(a.status)) {
    return NextResponse.json({ error: "Visit is closed." }, { status: 409 });
  }

  const joinedAt = { ...(a.joinedAt ?? {}) };
  joinedAt[isClient ? "client" : "provider"] = now;

  await ref.update({
    joinedAt,
    status: a.status === "booked" ? "in_progress" : a.status,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true, role: isClient ? "client" : "provider" });
}
