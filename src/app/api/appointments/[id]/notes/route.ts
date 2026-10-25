import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";

const FIELDS = ["subjective", "assessment", "plan", "prescribed"] as const;
type NoteField = (typeof FIELDS)[number];
const MAX_FIELD_LEN = 20_000;

/**
 * PATCH /api/appointments/[id]/notes
 * { subjective, assessment, plan, prescribed, reason? }
 *
 * Saves the SOAP note for a visit. Only the provider on the appointment or an
 * admin may write. When a note already exists and the content changed, the
 * previous version is appended to visitNotes/{id}/history before the
 * overwrite so amendments stay auditable.
 */
export async function PATCH(
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
  if (appt.providerId !== user.uid && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const next: Record<NoteField, string> = {
    subjective: "",
    assessment: "",
    plan: "",
    prescribed: "",
  };
  for (const f of FIELDS) {
    const v = body[f];
    if (v !== undefined && typeof v !== "string") {
      return NextResponse.json({ error: `Invalid ${f}` }, { status: 400 });
    }
    next[f] = (v ?? "").slice(0, MAX_FIELD_LEN);
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const noteRef = adminDb.collection(COLLECTIONS.visitNotes).doc(id);
  const noteSnap = await noteRef.get();
  const prev = noteSnap.exists ? noteSnap.data()! : null;
  const now = Date.now();

  const actorName =
    (await adminDb.collection(COLLECTIONS.users).doc(user.uid).get()).get(
      "displayName",
    ) ?? "Provider";

  const changed =
    !prev || FIELDS.some((f) => ((prev[f] as string | undefined) ?? "") !== next[f]);
  if (!changed) {
    return NextResponse.json({ ok: true, amended: false, unchanged: true });
  }

  const batch = adminDb.batch();
  let amended = false;
  if (prev) {
    // Only archive a version that actually had content; an empty shell isn't
    // an amendment worth tracking.
    const hadContent = FIELDS.some((f) => ((prev[f] as string | undefined) ?? "").trim());
    if (hadContent) {
      amended = true;
      const histRef = noteRef.collection("history").doc();
      batch.set(histRef, {
        id: histRef.id,
        appointmentId: id,
        subjective: prev.subjective ?? "",
        assessment: prev.assessment ?? "",
        plan: prev.plan ?? "",
        prescribed: prev.prescribed ?? "",
        versionSavedAt: prev.updatedAt ?? prev.createdAt ?? now,
        versionSavedBy: prev.updatedBy ?? prev.providerId ?? null,
        versionSavedByName: prev.updatedByName ?? null,
        editedBy: user.uid,
        editedByName: actorName,
        editedAt: now,
        ...(reason ? { reason } : {}),
      });
    }
  }

  batch.set(
    noteRef,
    {
      appointmentId: id,
      providerId: appt.providerId,
      clientId: appt.clientId,
      ...next,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      updatedBy: user.uid,
      updatedByName: actorName,
    },
    { merge: true },
  );
  await batch.commit();

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: amended ? "visitNote.amend" : "visitNote.create",
    targetType: "visitNote",
    targetId: id,
    meta: {
      appointmentId: id,
      clientId: appt.clientId,
      fields: FIELDS.filter((f) => ((prev?.[f] as string | undefined) ?? "") !== next[f]),
      ...(reason ? { reason } : {}),
    },
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    amended,
    note: {
      appointmentId: id,
      providerId: appt.providerId,
      clientId: appt.clientId,
      ...next,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      updatedBy: user.uid,
      updatedByName: actorName,
    },
  });
}
