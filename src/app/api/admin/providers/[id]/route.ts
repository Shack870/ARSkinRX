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
  const [pSnap, uSnap, apptSnap, availSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.providers).doc(id).get(),
    adminDb.collection(COLLECTIONS.users).doc(id).get(),
    adminDb
      .collection(COLLECTIONS.appointments)
      .where("providerId", "==", id)
      .orderBy("start", "desc")
      .get(),
    adminDb.collection(COLLECTIONS.availability).doc(id).get(),
  ]);
  if (!pSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const appts = apptSnap.docs.map((d) => d.data());
  const now = Date.now();

  // Calendar needs patient names; resolve once per unique client.
  const clientIds = Array.from(new Set(appts.map((a) => a.clientId as string)));
  const clientNames = new Map<string, string>();
  await Promise.all(
    clientIds.map(async (cid) => {
      const u = await adminDb.collection(COLLECTIONS.users).doc(cid).get();
      clientNames.set(cid, u.get("displayName") ?? "Patient");
    }),
  );
  const upcoming = appts
    .filter(
      (a) =>
        a.start >= now - 7 * 24 * 60 * 60_000 &&
        !["cancelled", "pending_payment"].includes(a.status),
    )
    .sort((a, b) => a.start - b.start);
  const completed = appts.filter((a) => a.status === "completed");
  const noShow = appts.filter((a) => a.status === "no_show").length;
  const cancelled = appts.filter((a) => a.status === "cancelled").length;
  const liveCompleted = completed.filter((a) => a.isLive).length;
  const net = (a: FirebaseFirestore.DocumentData) =>
    (a.priceCents ?? 0) - (a.platformFeeCents ?? 0);
  const denom = completed.length + noShow;

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
      liveCount: liveCompleted,
      noShow,
      cancelled,
      noShowRate: denom > 0 ? noShow / denom : 0,
      grossCents: completed.reduce((s, a) => s + (a.priceCents ?? 0), 0),
      platformCents: completed.reduce((s, a) => s + (a.platformFeeCents ?? 0), 0),
      paidOutCents: completed
        .filter((a) => a.providerPaidAt)
        .reduce((s, a) => s + net(a), 0),
      pendingCents: completed
        .filter((a) => !a.providerPaidAt)
        .reduce((s, a) => s + net(a), 0),
    },
    counts: {
      total: appts.filter((a) => a.status !== "pending_payment").length,
      upcoming: appts.filter(
        (a) => a.start >= now && ["booked", "in_progress"].includes(a.status),
      ).length,
    },
    availability: availSnap.exists
      ? {
          timezone: availSnap.get("timezone") ?? "America/Chicago",
          windows: availSnap.get("windows") ?? [],
          blackoutDates: availSnap.get("blackoutDates") ?? [],
        }
      : null,
    appointments: appts.slice(0, 50).map((a) => ({
      id: a.id,
      serviceId: a.serviceId,
      start: a.start,
      status: a.status,
      priceCents: a.priceCents,
    })),
    calendar: upcoming.map((a) => ({
      id: a.id,
      serviceId: a.serviceId,
      start: a.start,
      end: a.end,
      status: a.status,
      isLive: a.isLive === true,
      clientName: clientNames.get(a.clientId) ?? "Patient",
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
