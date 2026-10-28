import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { freeProvider } from "@/lib/live-server";
import { tickLiveQueue } from "@/lib/live-queue";
import { transferLiveVisitShare } from "@/lib/connect-server";
import { sendEmail, visitSummaryEmail } from "@/lib/notify";
import { resolvePrefs } from "@/lib/notifications";
import { getService } from "@/lib/services";
import { createPrescriptionsForVisit, parseItems } from "@/lib/prescriptions-server";
import { describeItem } from "@/lib/formulary";
import type { PrescriptionItem, ServiceType } from "@/lib/types";

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
  if (a.providerId !== user.uid && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // Medication decision: the nurse must say either "recommend" (with ≥1 item)
  // or "none" so no visit is left in limbo. Older clients that send neither
  // are treated as "none".
  let rxItems: PrescriptionItem[] | null = null;
  let rxReason = "";
  const rxDecision: "recommend" | "none" =
    body.rx?.decision === "recommend" ? "recommend" : "none";
  if (rxDecision === "recommend") {
    rxItems = parseItems(body.rx?.items);
    if (!rxItems) {
      return NextResponse.json(
        { error: "Add at least one medication with a drug name and directions." },
        { status: 400 },
      );
    }
    rxReason = String(body.rx?.reason ?? "");
  }

  const now = Date.now();
  const batch = adminDb.batch();

  batch.update(ref, { status: "completed", rxDecision, updatedAt: now });

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
        // Clinical record of what was recommended; the structured Rx lives in
        // the prescriptions collection and is what the prescriber acts on.
        prescribed: rxItems
          ? rxItems.map(describeItem).join("\n")
          : String(body.notes.prescribed ?? ""),
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  await batch.commit();

  if (rxItems) {
    try {
      await createPrescriptionsForVisit({
        appointmentId: id,
        clientId: a.clientId,
        providerId: a.providerId,
        serviceId: a.serviceId as ServiceType,
        items: rxItems,
        reason: rxReason,
        actor: { uid: user.uid, isAdmin: Boolean(user.isAdmin) },
      });
    } catch (err) {
      console.error("[appointments/complete] rx create failed", err);
    }
  }

  // Free the nurse to take the next real-time visit (this also rings the next
  // patient in their line), and send them their share via Stripe Connect if
  // they've onboarded (otherwise it stays owed manually).
  if (a.isLive) {
    await freeProvider(a.providerId);
    try {
      await transferLiveVisitShare(id);
    } catch (err) {
      // Leave the visit as manually owed; admin payouts will pick it up.
      console.error("[appointments/complete] live transfer failed", err);
    }
  } else {
    // A scheduled block just cleared — queued live patients may now be admissible.
    await tickLiveQueue().catch(() => {});
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
            // Don't list drug names until the prescriber has signed off.
            prescribed: rxItems ? "" : String(body.notes.prescribed ?? ""),
            rxPending: Boolean(rxItems),
          }),
        });
      }
    } catch {
      // non-critical
    }
  }

  return NextResponse.json({ ok: true });
}

