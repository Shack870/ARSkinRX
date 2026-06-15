import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import type { ProviderStatus } from "@/lib/types";

/** GET /api/admin/providers/[id] — full provider record + visits + earnings. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [pSnap, uSnap, apptSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.providers).doc(id).get(),
    adminDb.collection(COLLECTIONS.users).doc(id).get(),
    adminDb
      .collection(COLLECTIONS.appointments)
      .where("providerId", "==", id)
      .orderBy("start", "desc")
      .limit(50)
      .get(),
  ]);
  if (!pSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const appts = apptSnap.docs.map((d) => d.data());
  const completed = appts.filter((a) => a.status === "completed");
  const net = (a: FirebaseFirestore.DocumentData) =>
    (a.priceCents ?? 0) - (a.platformFeeCents ?? 0);

  return NextResponse.json({
    provider: {
      uid: id,
      displayName: uSnap.get("displayName") ?? "—",
      email: uSnap.get("email") ?? "—",
      phone: uSnap.get("phone") ?? "",
      licenseNumber: pSnap.get("licenseNumber"),
      conditions: pSnap.get("conditions") ?? [],
      status: pSnap.get("status"),
      bio: pSnap.get("bio") ?? "",
      createdAt: pSnap.get("createdAt"),
    },
    earnings: {
      completedCount: completed.length,
      paidOutCents: completed
        .filter((a) => a.providerPaidAt)
        .reduce((s, a) => s + net(a), 0),
      pendingCents: completed
        .filter((a) => !a.providerPaidAt)
        .reduce((s, a) => s + net(a), 0),
    },
    appointments: appts.map((a) => ({
      id: a.id,
      serviceId: a.serviceId,
      start: a.start,
      status: a.status,
      priceCents: a.priceCents,
    })),
  });
}

/** PATCH /api/admin/providers/[id] { action: 'approve'|'suspend'|'reinstate' } */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { action } = await req.json().catch(() => ({}));

  const statusMap: Record<string, ProviderStatus> = {
    approve: "approved",
    suspend: "suspended",
    reinstate: "approved",
  };
  const status = statusMap[action];
  if (!status) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const ref = adminDb.collection(COLLECTIONS.providers).doc(id);
  if (!(await ref.get()).exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await ref.update({ status, updatedAt: Date.now() });
  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: admin.uid,
    action: `provider.${action}`,
    targetType: "provider",
    targetId: id,
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, status });
}
