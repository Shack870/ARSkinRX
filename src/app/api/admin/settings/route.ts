import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { getLivePriceCents } from "@/lib/live-server";

/** GET /api/admin/settings — platform settings (real-time visit price). */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const realtimePriceCents = await getLivePriceCents();
  return NextResponse.json({ realtimePriceCents });
}

/** PUT /api/admin/settings { realtimePriceCents } */
export async function PUT(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { realtimePriceCents } = await req.json().catch(() => ({}));
  const cents = Number(realtimePriceCents);
  if (!Number.isFinite(cents) || cents < 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  await adminDb
    .collection(COLLECTIONS.settings)
    .doc("live")
    .set(
      { realtimePriceCents: Math.round(cents), updatedAt: Date.now() },
      { merge: true },
    );
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: admin.uid,
    action: "settings.update",
    targetType: "settings",
    targetId: "live",
    meta: { realtimePriceCents: Math.round(cents) },
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
