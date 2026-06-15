import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import { getEffectiveService } from "@/lib/services-server";
import { platformFeeCents } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType } from "@/lib/types";

const HOLD_MINUTES = 15;

/**
 * POST /api/appointments
 * Creates an appointment in `pending_payment` with a short hold, plus the
 * intake record. Validates the slot is still free to prevent double-booking.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "appointments", 20);
  if (limited) return limited;

  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const providerId = String(body.providerId ?? "");
  const serviceId = body.serviceId as ServiceType;
  const start = Number(body.start);
  const intakeAnswers = (body.intake ?? {}) as Record<string, unknown>;
  const photoPaths: string[] = Array.isArray(body.photoPaths)
    ? body.photoPaths
    : [];

  const service = getService(serviceId);
  if (!providerId || !service || !Number.isFinite(start)) {
    return NextResponse.json({ error: "Invalid booking" }, { status: 400 });
  }
  const end = start + service.durationMinutes * 60 * 1000;
  if (start < Date.now()) {
    return NextResponse.json({ error: "Slot is in the past" }, { status: 400 });
  }

  // Provider must be approved and treat this condition.
  const providerSnap = await adminDb
    .collection(COLLECTIONS.providers)
    .doc(providerId)
    .get();
  if (
    !providerSnap.exists ||
    providerSnap.get("status") !== "approved" ||
    !(providerSnap.get("conditions") ?? []).includes(serviceId)
  ) {
    return NextResponse.json(
      { error: "Provider unavailable for this service" },
      { status: 409 },
    );
  }

  const effective = await getEffectiveService(serviceId);
  if (effective && effective.enabled === false) {
    return NextResponse.json(
      { error: "This service isn't available right now." },
      { status: 409 },
    );
  }
  // Pricing is controlled centrally by admin (effective service price).
  const priceCents = effective?.defaultPriceCents ?? service.defaultPriceCents;

  const now = Date.now();
  const holdExpiresAt = now + HOLD_MINUTES * 60 * 1000;
  const apptRef = adminDb.collection(COLLECTIONS.appointments).doc();
  const intakeRef = adminDb.collection(COLLECTIONS.intakeResponses).doc();

  // Transaction: re-check overlap right before writing.
  try {
    await adminDb.runTransaction(async (tx) => {
      const conflictSnap = await tx.get(
        adminDb
          .collection(COLLECTIONS.appointments)
          .where("providerId", "==", providerId)
          .where("start", "==", start),
      );
      const blocking = conflictSnap.docs.some((d) => {
        const s = d.get("status");
        if (["cancelled", "no_show"].includes(s)) return false;
        if (s === "pending_payment" && (d.get("holdExpiresAt") ?? 0) < now)
          return false;
        return true;
      });
      if (blocking) throw new Error("SLOT_TAKEN");

      tx.set(apptRef, {
        id: apptRef.id,
        clientId: user.uid,
        providerId,
        serviceId,
        start,
        end,
        status: "pending_payment",
        priceCents,
        platformFeeCents: platformFeeCents(priceCents),
        intakeId: intakeRef.id,
        holdExpiresAt,
        createdAt: now,
        updatedAt: now,
      });

      tx.set(intakeRef, {
        id: intakeRef.id,
        appointmentId: apptRef.id,
        clientId: user.uid,
        providerId,
        serviceId,
        answers: intakeAnswers,
        photoPaths,
        createdAt: now,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return NextResponse.json(
        { error: "That time was just taken. Please pick another." },
        { status: 409 },
      );
    }
    throw e;
  }

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "appointment.create",
    targetType: "appointment",
    targetId: apptRef.id,
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    appointmentId: apptRef.id,
    priceCents,
    holdExpiresAt,
  });
}
