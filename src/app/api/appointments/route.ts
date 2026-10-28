import { NextResponse } from "next/server";
import { savePatientDetailsFromIntake } from "@/lib/patient-details-server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import { getEffectiveService } from "@/lib/services-server";
import { platformFeeCents } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";
import {
  createPendingAppointment,
  SlotTakenError,
} from "@/lib/appointments-server";
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

  const holdExpiresAt = Date.now() + HOLD_MINUTES * 60 * 1000;

  let appointmentId: string;
  try {
    ({ appointmentId } = await createPendingAppointment({
      clientId: user.uid,
      providerId,
      serviceId,
      start,
      end,
      priceCents,
      platformFeeCents: platformFeeCents(priceCents),
      holdExpiresAt,
      intake: intakeAnswers,
      photoPaths,
    }));
  } catch (e) {
    if (e instanceof SlotTakenError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  await savePatientDetailsFromIntake(user.uid, body);

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "appointment.create",
    targetType: "appointment",
    targetId: appointmentId,
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ appointmentId, priceCents, holdExpiresAt });
}
