import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { freeProvider } from "@/lib/live-server";
import { sendEmail, visitSummaryEmail } from "@/lib/notify";
import { resolvePrefs } from "@/lib/notifications";
import { getService } from "@/lib/services";
import type { ServiceType } from "@/lib/types";

/**
 * POST /api/appointments/[id]/complete
 * The provider ends the visit. Optionally saves visit notes (PHI) at the same
 * time. Only the provider on the appointment (or an admin) may complete it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ref = adminDb.collection(COLLECTIONS.appointments).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const a = snap.data()!;
  if (a.providerId !== user.uid && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const now = Date.now();
  const batch = adminDb.batch();

  batch.update(ref, { status: "completed", updatedAt: now });

  if (body.notes) {
    const notesRef = adminDb.collection(COLLECTIONS.visitNotes).doc(id);
    batch.set(
      notesRef,
      {
        appointmentId: id,
        providerId: a.providerId,
        clientId: a.clientId,
        subjective: String(body.notes.subjective ?? ""),
        assessment: String(body.notes.assessment ?? ""),
        plan: String(body.notes.plan ?? ""),
        prescribed: String(body.notes.prescribed ?? ""),
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  await batch.commit();

  // Free the nurse to take the next real-time visit.
  if (a.isLive) {
    await freeProvider(a.providerId);
  }

  // Email the patient their visit summary (best effort, respects email prefs).
  if (body.notes) {
    try {
      const clientSnap = await adminDb
        .collection(COLLECTIONS.users)
        .doc(a.clientId)
        .get();
      const prefs = resolvePrefs(clientSnap.get("notificationPrefs"));
      const email = clientSnap.get("email");
      if (prefs.receipt && email) {
        const name = (clientSnap.get("displayName") ?? "there").split(" ")[0];
        const service = getService(a.serviceId as ServiceType);
        await sendEmail({
          to: email,
          ...visitSummaryEmail({
            name,
            serviceName: service?.name ?? "visit",
            assessment: String(body.notes.assessment ?? ""),
            plan: String(body.notes.plan ?? ""),
            prescribed: String(body.notes.prescribed ?? ""),
          }),
        });
      }
    } catch {
      // non-critical
    }
  }

  return NextResponse.json({ ok: true });
}

