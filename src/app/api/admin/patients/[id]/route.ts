import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";

/** GET /api/admin/patients/[id] — patient profile + visits + payments. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [uSnap, apptSnap, paySnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.users).doc(id).get(),
    adminDb
      .collection(COLLECTIONS.appointments)
      .where("clientId", "==", id)
      .orderBy("start", "desc")
      .limit(50)
      .get(),
    adminDb
      .collection(COLLECTIONS.payments)
      .where("clientId", "==", id)
      .get(),
  ]);
  if (!uSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const totalPaidCents = paySnap.docs.reduce(
    (s, d) => s + (d.get("amountCents") ?? 0) - (d.get("refundedCents") ?? 0),
    0,
  );

  return NextResponse.json({
    patient: {
      uid: id,
      displayName: uSnap.get("displayName") ?? "—",
      email: uSnap.get("email") ?? "—",
      phone: uSnap.get("phone") ?? "",
      createdAt: uSnap.get("createdAt") ?? 0,
    },
    totalPaidCents,
    paymentCount: paySnap.size,
    appointments: apptSnap.docs.map((d) => ({
      id: d.id,
      serviceId: d.get("serviceId"),
      start: d.get("start"),
      status: d.get("status"),
      priceCents: d.get("priceCents"),
    })),
  });
}
