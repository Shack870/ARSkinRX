import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";

/**
 * GET /api/appointments/[id]/patient-history
 * For the provider on a visit: returns the patient's most recent prior visit's
 * notes (continuity of care) plus a count of past visits. Authorized because
 * the requester has a current visit with this patient.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const apptSnap = await adminDb.collection(COLLECTIONS.appointments).doc(id).get();
  if (!apptSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const appt = apptSnap.data()!;
  if (appt.providerId !== user.uid && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The patient's completed visits, most recent first, excluding this one.
  const priorSnap = await adminDb
    .collection(COLLECTIONS.appointments)
    .where("clientId", "==", appt.clientId)
    .where("status", "==", "completed")
    .orderBy("start", "desc")
    .limit(10)
    .get();

  const prior = priorSnap.docs.filter((d) => d.id !== id);
  const pastVisitCount = prior.length;

  let lastVisit: unknown = null;
  for (const d of prior) {
    const notesSnap = await adminDb
      .collection(COLLECTIONS.visitNotes)
      .doc(d.id)
      .get();
    if (notesSnap.exists) {
      const providerSnap = await adminDb
        .collection(COLLECTIONS.users)
        .doc(d.get("providerId"))
        .get();
      lastVisit = {
        appointmentId: d.id,
        serviceId: d.get("serviceId"),
        start: d.get("start"),
        providerName: providerSnap.get("displayName") ?? "—",
        subjective: notesSnap.get("subjective") ?? "",
        assessment: notesSnap.get("assessment") ?? "",
        plan: notesSnap.get("plan") ?? "",
        prescribed: notesSnap.get("prescribed") ?? "",
      };
      break;
    }
  }

  return NextResponse.json({ pastVisitCount, lastVisit });
}
