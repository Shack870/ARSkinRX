import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getEffectiveService } from "@/lib/services-server";
import { generateSlots } from "@/lib/slots";
import { platformFeeCents } from "@/lib/stripe";
import {
  SlotTakenError,
  confirmAppointmentBooked,
  createPendingAppointment,
} from "@/lib/appointments-server";
import { refundLiveRequest } from "@/lib/refunds-server";
import { recomputeQueueForProvider } from "@/lib/live-queue";
import {
  SCHEDULE_INSTEAD_REFUND_CENTS,
  SCHEDULE_INSTEAD_WAIT_MS,
} from "@/lib/live-queue-math";
import { rateLimit } from "@/lib/rate-limit";
import type { ProviderAvailability, ServiceType } from "@/lib/types";

/**
 * POST /api/live/schedule-instead { liveRequestId, providerId, start }
 *
 * A paid live patient facing a long wait (projected > 30 min, or already
 * waited > 30 min) converts to a scheduled visit with the chosen nurse:
 *  - books the slot (same availability rules as /api/slots), paid from the
 *    live payment — no new charge;
 *  - refunds $20.00 of the live premium on the original payment intent;
 *  - marks the live request `converted` and returns the appointment id.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "live-schedule-instead", 20);
  if (limited) return limited;

  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const liveRequestId = String(body.liveRequestId ?? "");
  const providerId = String(body.providerId ?? "");
  const start = Number(body.start);
  if (!liveRequestId || !providerId || !Number.isFinite(start)) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const reqRef = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists || reqSnap.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const lr = reqSnap.data()!;
  if (lr.status === "converted" && lr.convertedAppointmentId) {
    return NextResponse.json({ ok: true, appointmentId: lr.convertedAppointmentId });
  }
  if (lr.status !== "queued" && lr.status !== "searching") {
    return NextResponse.json(
      { error: "This request can no longer be converted." },
      { status: 409 },
    );
  }

  const now = Date.now();
  const waitedMs = now - (lr.queuedAt ?? lr.paidAt ?? lr.createdAt ?? now);
  const projectedMs = (lr.estimateAt ?? now) - now;
  if (waitedMs < SCHEDULE_INSTEAD_WAIT_MS && projectedMs < SCHEDULE_INSTEAD_WAIT_MS) {
    return NextResponse.json(
      { error: "Scheduling instead is offered when the wait is over 30 minutes." },
      { status: 409 },
    );
  }

  const serviceId = lr.serviceId as ServiceType;
  const service = await getEffectiveService(serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  // Provider must exist, be approved, and treat this condition.
  const providerSnap = await adminDb
    .collection(COLLECTIONS.providers)
    .doc(providerId)
    .get();
  if (
    !providerSnap.exists ||
    providerSnap.get("status") !== "approved" ||
    !(providerSnap.get("conditions") ?? []).includes(serviceId)
  ) {
    return NextResponse.json({ error: "Provider unavailable" }, { status: 400 });
  }

  // Validate the slot against the nurse's live availability (same rules as /api/slots).
  const [availSnap, apptSnap] = await Promise.all([
    adminDb.collection(COLLECTIONS.availability).doc(providerId).get(),
    adminDb
      .collection(COLLECTIONS.appointments)
      .where("providerId", "==", providerId)
      .where("start", ">=", now)
      .get(),
  ]);
  if (!availSnap.exists) {
    return NextResponse.json({ error: "No open times for this nurse." }, { status: 409 });
  }
  const avail = availSnap.data() as ProviderAvailability;
  const busy = apptSnap.docs
    .map((d) => d.data())
    .filter((a) => {
      if (["cancelled", "no_show"].includes(a.status)) return false;
      if (a.status === "pending_payment" && (a.holdExpiresAt ?? 0) < now) return false;
      return true;
    })
    .map((a) => ({ start: a.start as number, end: a.end as number }));
  const slots = generateSlots({
    windows: avail.windows ?? [],
    timeZone: avail.timezone ?? "America/Chicago",
    durationMinutes: service.durationMinutes,
    busy,
    blackoutDates: avail.blackoutDates ?? [],
    now,
  });
  const slot = slots.find((s) => s.start === start);
  if (!slot) {
    return NextResponse.json(
      { error: "That time is no longer available. Pick another." },
      { status: 409 },
    );
  }

  // Scheduled price; paid out of the live payment (no new charge).
  const priceCents = providerSnap.get("priceOverrides")?.[serviceId] ?? service.defaultPriceCents;
  let appointmentId: string;
  try {
    const created = await createPendingAppointment({
      clientId: user.uid,
      providerId,
      serviceId,
      start: slot.start,
      end: slot.end,
      priceCents,
      platformFeeCents: platformFeeCents(priceCents),
      holdExpiresAt: null,
      intake: lr.intake ?? {},
      photoPaths: Array.isArray(lr.photoPaths) ? lr.photoPaths : [],
      extra: { convertedFromLiveRequestId: liveRequestId },
    });
    appointmentId = created.appointmentId;
  } catch (e) {
    if (e instanceof SlotTakenError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  await confirmAppointmentBooked(appointmentId, {
    stripePaymentIntentId: lr.stripePaymentIntentId ?? `manual_${liveRequestId}`,
    amountCents: priceCents,
    platformFeeCents: platformFeeCents(priceCents),
    payoutVia: "manual",
  });

  // Mark the live request converted *before* the partial refund so a refund
  // hiccup can't leave a converted patient still sitting in a line.
  await reqRef.update({
    status: "converted",
    convertedAppointmentId: appointmentId,
    convertedAt: now,
    offeredTo: null,
    offerExpiresAt: null,
    updatedAt: now,
  });

  let refundedCents = 0;
  try {
    const r = await refundLiveRequest(liveRequestId, {
      amountCents: Math.min(SCHEDULE_INSTEAD_REFUND_CENTS, lr.priceCents ?? 0),
      reason: "schedule_instead",
      actorId: user.uid,
    });
    refundedCents = r.amountCents;
  } catch (err) {
    console.error("[live/schedule-instead] $20 refund failed", liveRequestId, err);
  }

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: user.uid,
    action: "live.schedule_instead",
    targetType: "liveRequest",
    targetId: liveRequestId,
    meta: { appointmentId, providerId, start: slot.start, refundedCents },
    timestamp: FieldValue.serverTimestamp(),
  });

  if (lr.queuedProviderId) {
    await recomputeQueueForProvider(lr.queuedProviderId).catch(() => {});
  }

  return NextResponse.json({ ok: true, appointmentId, refundedCents });
}
