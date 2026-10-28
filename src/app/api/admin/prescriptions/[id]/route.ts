import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import {
  approvePrescription,
  declinePrescription,
  markPrescriptionSent,
  parseItems,
  RxStateError,
} from "@/lib/prescriptions-server";
import type { IntakeResponse, Prescription, ServiceType, VisitNote } from "@/lib/types";

/**
 * GET /api/admin/prescriptions/[id]
 * Everything the prescriber needs on one screen to decide: the patient, the
 * intake, the nurse's note, the recommendation, and the patient's prior
 * prescriptions.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const snap = await adminDb.collection(COLLECTIONS.prescriptions).doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rx = snap.data() as Prescription;

  const [patient, nurse, appt, note, intakeSnap, siblings, priorSnap] =
    await Promise.all([
      adminDb.collection(COLLECTIONS.users).doc(rx.clientId).get(),
      adminDb.collection(COLLECTIONS.users).doc(rx.providerId).get(),
      adminDb.collection(COLLECTIONS.appointments).doc(rx.appointmentId).get(),
      adminDb.collection(COLLECTIONS.visitNotes).doc(rx.appointmentId).get(),
      adminDb
        .collection(COLLECTIONS.intakeResponses)
        .where("appointmentId", "==", rx.appointmentId)
        .limit(1)
        .get(),
      adminDb
        .collection(COLLECTIONS.prescriptions)
        .where("appointmentId", "==", rx.appointmentId)
        .get(),
      adminDb
        .collection(COLLECTIONS.prescriptions)
        .where("clientId", "==", rx.clientId)
        .get(),
    ]);

  const service = getService(rx.serviceId as ServiceType);
  const intake = intakeSnap.empty ? null : (intakeSnap.docs[0].data() as IntakeResponse);
  const prior = priorSnap.docs
    .map((d) => d.data() as Prescription)
    .filter((p) => p.appointmentId !== rx.appointmentId)
    .sort((a, b) => b.recommendedAt - a.recommendedAt)
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      status: p.status,
      item: p.final ?? p.recommended,
      at: p.sentAt ?? p.reviewedAt ?? p.recommendedAt,
      serviceName: getService(p.serviceId as ServiceType)?.name ?? p.serviceId,
    }));

  return NextResponse.json({
    prescription: rx,
    patient: {
      uid: rx.clientId,
      displayName: patient.get("displayName") ?? "—",
      email: patient.get("email") ?? null,
      phone: patient.get("phone") ?? null,
      dob: patient.get("dob") ?? null,
      pharmacy: patient.get("pharmacy") ?? rx.pharmacy ?? null,
    },
    nurse: {
      uid: rx.providerId,
      displayName: nurse.get("displayName") ?? rx.recommendedByName,
    },
    appointment: {
      id: rx.appointmentId,
      serviceName: service?.name ?? rx.serviceId,
      start: appt.get("start") ?? null,
      isLive: appt.get("isLive") === true,
      priceCents: appt.get("priceCents") ?? 0,
      refundId: appt.get("refundId") ?? null,
    },
    note: note.exists ? (note.data() as VisitNote) : null,
    intake,
    siblings: siblings.docs
      .filter((d) => d.id !== id)
      .map((d) => {
        const p = d.data() as Prescription;
        return { id: d.id, status: p.status, item: p.final ?? p.recommended };
      }),
    prior,
  });
}

/**
 * PATCH /api/admin/prescriptions/[id]
 *   { action: "approve", final?: PrescriptionItem }
 *   { action: "decline", reason: string }
 *   { action: "sent", via?: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const actor = { uid: admin.uid };

  try {
    switch (body.action) {
      case "approve": {
        let final = null;
        if (body.final) {
          const parsed = parseItems([body.final]);
          if (!parsed) {
            return NextResponse.json(
              { error: "Drug name and directions are required." },
              { status: 400 },
            );
          }
          final = parsed[0];
        }
        await approvePrescription(id, final, actor);
        return NextResponse.json({ ok: true });
      }
      case "decline": {
        const result = await declinePrescription(id, String(body.reason ?? ""), actor);
        return NextResponse.json({ ok: true, ...result });
      }
      case "sent": {
        await markPrescriptionSent(id, String(body.via ?? ""), actor);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof RxStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[admin/prescriptions]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
