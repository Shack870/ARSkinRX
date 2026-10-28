import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import type { Prescription, ServiceType } from "@/lib/types";

export interface RxQueueRow {
  id: string;
  appointmentId: string;
  status: Prescription["status"];
  patientId: string;
  patientName: string;
  patientDob: string | null;
  patientPhone: string | null;
  nurseName: string;
  serviceName: string;
  visitStart: number;
  item: Prescription["recommended"];
  reason: string;
  pharmacy: Prescription["pharmacy"];
  recommendedAt: number;
  reviewedAt: number | null;
}

/**
 * GET /api/admin/prescriptions
 * The prescriber's two working lists: items waiting for review and items
 * approved but not yet sent to the pharmacy. Oldest first so she works in order.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb
    .collection(COLLECTIONS.prescriptions)
    .where("status", "in", ["recommended", "approved"])
    .get();

  const userCache = new Map<string, Promise<FirebaseFirestore.DocumentSnapshot>>();
  const userOf = (uid: string) => {
    let p = userCache.get(uid);
    if (!p) {
      p = adminDb.collection(COLLECTIONS.users).doc(uid).get();
      userCache.set(uid, p);
    }
    return p;
  };
  const apptCache = new Map<string, Promise<FirebaseFirestore.DocumentSnapshot>>();
  const apptOf = (id: string) => {
    let p = apptCache.get(id);
    if (!p) {
      p = adminDb.collection(COLLECTIONS.appointments).doc(id).get();
      apptCache.set(id, p);
    }
    return p;
  };

  const rows: RxQueueRow[] = await Promise.all(
    snap.docs.map(async (d) => {
      const rx = d.data() as Prescription;
      const [patient, nurse, appt] = await Promise.all([
        userOf(rx.clientId),
        userOf(rx.providerId),
        apptOf(rx.appointmentId),
      ]);
      const service = getService(rx.serviceId as ServiceType);
      return {
        id: d.id,
        appointmentId: rx.appointmentId,
        status: rx.status,
        patientId: rx.clientId,
        patientName: (patient.get("displayName") as string) ?? "—",
        patientDob: (patient.get("dob") as string) ?? null,
        patientPhone: (patient.get("phone") as string) ?? null,
        nurseName: rx.recommendedByName ?? ((nurse.get("displayName") as string) ?? "—"),
        serviceName: service?.name ?? rx.serviceId,
        visitStart: (appt.get("start") as number) ?? rx.recommendedAt,
        item: rx.status === "approved" && rx.final ? rx.final : rx.recommended,
        reason: rx.reason ?? "",
        // Prefer the patient's current pharmacy over the snapshot.
        pharmacy: patient.get("pharmacy") ?? rx.pharmacy ?? null,
        recommendedAt: rx.recommendedAt,
        reviewedAt: rx.reviewedAt ?? null,
      };
    }),
  );

  const toReview = rows
    .filter((r) => r.status === "recommended")
    .sort((a, b) => a.recommendedAt - b.recommendedAt);
  const toSend = rows
    .filter((r) => r.status === "approved")
    .sort((a, b) => (a.reviewedAt ?? 0) - (b.reviewedAt ?? 0));

  return NextResponse.json({ toReview, toSend });
}
