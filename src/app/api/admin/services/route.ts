import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { getEffectiveServices } from "@/lib/services-server";
import { SERVICE_MAP } from "@/lib/services";
import type { ServiceType } from "@/lib/types";

/** GET /api/admin/services — effective catalog for management. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const services = await getEffectiveServices();
  return NextResponse.json({ services });
}

/** PUT /api/admin/services { id, enabled, defaultPriceCents } — upsert override. */
export async function PUT(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, enabled, defaultPriceCents } = await req.json().catch(() => ({}));
  if (!id || !(id in SERVICE_MAP)) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }
  const price = Number(defaultPriceCents);
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  await adminDb
    .collection(COLLECTIONS.services)
    .doc(id)
    .set(
      {
        id,
        enabled: enabled !== false,
        defaultPriceCents: Math.round(price),
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: admin.uid,
    action: "service.update",
    targetType: "service",
    targetId: id as ServiceType,
    meta: { enabled: enabled !== false, defaultPriceCents: Math.round(price) },
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
