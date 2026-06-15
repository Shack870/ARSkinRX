import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import { randomUUID } from "crypto";
import type { ServiceType } from "@/lib/types";

/**
 * POST /api/appointments/[id]/reschedule { start }
 * Free reschedule for a missed (no_show) visit. Carries the original payment
 * forward — no new charge. Allowed once per original booking.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { start } = await req.json().catch(() => ({}));
  if (!Number.isFinite(Number(start))) {
    return NextResponse.json({ error: "Invalid time" }, { status: 400 });
  }
  const newStart = Number(start);

  const origRef = adminDb.collection(COLLECTIONS.appointments).doc(id);
  const orig = await origRef.get();
  if (!orig.exists || orig.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (orig.get("status") !== "no_show" || orig.get("rescheduledToId")) {
    return NextResponse.json(
      { error: "This visit can't be rescheduled." },
      { status: 409 },
    );
  }

  const serviceId = orig.get("serviceId") as ServiceType;
  const service = getService(serviceId);
  if (!service || newStart < Date.now()) {
    return NextResponse.json({ error: "Invalid time" }, { status: 400 });
  }
  const newEnd = newStart + service.durationMinutes * 60 * 1000;
  const providerId = orig.get("providerId");
  const now = Date.now();

  const newRef = adminDb.collection(COLLECTIONS.appointments).doc();
  try {
    await adminDb.runTransaction(async (tx) => {
      const conflict = await tx.get(
        adminDb
          .collection(COLLECTIONS.appointments)
          .where("providerId", "==", providerId)
          .where("start", "==", newStart),
      );
      const blocked = conflict.docs.some((d) =>
        ["booked", "in_progress"].includes(d.get("status")),
      );
      if (blocked) throw new Error("SLOT_TAKEN");

      tx.set(newRef, {
        id: newRef.id,
        clientId: user.uid,
        providerId,
        serviceId,
        start: newStart,
        end: newEnd,
        status: "booked",
        priceCents: orig.get("priceCents"),
        platformFeeCents: orig.get("platformFeeCents"),
        paymentId: orig.get("paymentId") ?? null,
        stripePaymentIntentId: orig.get("stripePaymentIntentId") ?? null,
        intakeId: orig.get("intakeId") ?? null,
        videoRoomId: randomUUID(),
        rescheduledFromId: id,
        createdAt: now,
        updatedAt: now,
      });
      tx.update(origRef, {
        rescheduledToId: newRef.id,
        status: "rescheduled",
        updatedAt: now,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return NextResponse.json(
        { error: "That time was just taken. Pick another." },
        { status: 409 },
      );
    }
    throw e;
  }

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "appointment.reschedule",
    targetType: "appointment",
    targetId: newRef.id,
    meta: { from: id },
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ appointmentId: newRef.id });
}
