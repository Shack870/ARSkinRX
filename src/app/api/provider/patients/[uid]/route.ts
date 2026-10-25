import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getService } from "@/lib/services";
import type {
  Appointment,
  ProviderPatientDetail,
  ProviderPatientVisit,
  ServiceType,
  VisitNote,
  VisitNoteHistoryEntry,
} from "@/lib/types";
import {
  EXCLUDED_STATUSES,
  ageFromDob,
  loadUsers,
  resolveProviderScope,
} from "../_lib";

/**
 * GET /api/provider/patients/[uid]
 * A patient's profile plus their visit timeline (newest first) with intake,
 * SOAP note and the note's amendment history. A nurse must have seen the
 * patient (a non-pending appointment) to view; admins may view anyone.
 * Nurses see the patient's visits with every nurse (continuity of care) but
 * may only edit notes on their own visits — see `canEdit`.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const scope = await resolveProviderScope(req);
  if (!scope.ok) return scope.res;
  const { user, providerId } = scope;
  const { uid } = await params;

  const [userSnap, apptSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.users).doc(uid).get(),
    adminDb
      .collection(COLLECTIONS.appointments)
      .where("clientId", "==", uid)
      .get(),
  ]);

  const appts = apptSnap.docs
    .map((d) => ({ ...(d.data() as Appointment), id: d.id }))
    .filter((a) => !EXCLUDED_STATUSES.has(a.status));

  // Authorization: a nurse must have an actual relationship with this patient.
  if (!user.isAdmin) {
    const seen = appts.some((a) => a.providerId === user.uid);
    if (!seen) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  if (!userSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Admin scoping to one nurse's visits when ?providerId= is given.
  const visible = providerId && user.isAdmin
    ? appts.filter((a) => a.providerId === providerId)
    : appts;
  visible.sort((a, b) => b.start - a.start);

  const providerIds = Array.from(new Set(visible.map((a) => a.providerId)));
  const providers = await loadUsers(providerIds);

  const visits: ProviderPatientVisit[] = await Promise.all(
    visible.map(async (a) => {
      const noteRef = adminDb.collection(COLLECTIONS.visitNotes).doc(a.id);
      const [intakeSnap, noteSnap, histSnap] = await Promise.all([
        a.intakeId
          ? adminDb.collection(COLLECTIONS.intakeResponses).doc(a.intakeId).get()
          : Promise.resolve(null),
        noteRef.get(),
        noteRef.collection("history").get(),
      ]);
      const noteHistory: VisitNoteHistoryEntry[] = histSnap.docs
        .map((d) => ({ ...(d.data() as VisitNoteHistoryEntry), id: d.id }))
        .sort((x, y) => y.editedAt - x.editedAt);
      return {
        appointment: a,
        serviceName: getService(a.serviceId as ServiceType)?.name ?? a.serviceId,
        providerName: providers.get(a.providerId)?.displayName ?? "Provider",
        canEdit: user.isAdmin || a.providerId === user.uid,
        intake:
          intakeSnap && intakeSnap.exists
            ? {
                answers: intakeSnap.get("answers") ?? {},
                photoPaths: intakeSnap.get("photoPaths") ?? [],
              }
            : null,
        note: noteSnap.exists ? (noteSnap.data() as VisitNote) : null,
        noteHistory,
      };
    }),
  );

  const dob = typeof userSnap.get("dob") === "string" ? (userSnap.get("dob") as string) : null;
  const body: ProviderPatientDetail = {
    profile: {
      uid,
      displayName: userSnap.get("displayName") ?? "Patient",
      email: userSnap.get("email") ?? "",
      phone: userSnap.get("phone") ?? "",
      dob,
      age: ageFromDob(dob),
    },
    visits,
  };
  return NextResponse.json(body);
}
