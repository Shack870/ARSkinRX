import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { requireAdmin } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import { getEffectiveService } from "@/lib/services-server";
import { platformFeeCents } from "@/lib/stripe";
import { findOrCreateClient } from "@/lib/clients-server";
import {
  confirmAppointmentBooked,
  createPendingAppointment,
  SlotTakenError,
} from "@/lib/appointments-server";
import type { ServiceType } from "@/lib/types";

/**
 * POST /api/admin/appointments — book a visit on a patient's behalf.
 *
 * Body: { clientEmail, clientName?, clientPhone?, providerId, serviceId,
 *         start (ms), payment: "offline" | "comp", amountCents?, note? }
 *
 * The patient is found by email or created (password-less; they set one from
 * the "finish your account" prompt). The visit lands directly as `booked`,
 * with a payment record marked manual so revenue/payout math stays correct.
 * "comp" records a $0 payment. The patient gets the normal confirmation email.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const clientEmail = String(body.clientEmail ?? "").trim().toLowerCase();
  const clientName = String(body.clientName ?? "").trim();
  const clientPhone = String(body.clientPhone ?? "").trim();
  const providerId = String(body.providerId ?? "");
  const serviceId = body.serviceId as ServiceType;
  const start = Number(body.start);
  const payment = body.payment === "comp" ? "comp" : "offline";
  const note = String(body.note ?? "").trim();

  if (!/^\S+@\S+\.\S+$/.test(clientEmail)) {
    return NextResponse.json({ error: "Enter a valid patient email." }, { status: 400 });
  }
  const service = getService(serviceId);
  if (!providerId || !service || !Number.isFinite(start)) {
    return NextResponse.json({ error: "Missing provider, service, or time." }, { status: 400 });
  }
  if (start < Date.now() - 5 * 60_000) {
    return NextResponse.json({ error: "That time is in the past." }, { status: 400 });
  }

  const providerSnap = await adminDb.collection(COLLECTIONS.providers).doc(providerId).get();
  if (!providerSnap.exists || providerSnap.get("status") !== "approved") {
    return NextResponse.json({ error: "Provider is not approved." }, { status: 409 });
  }
  if (!(providerSnap.get("conditions") ?? []).includes(serviceId)) {
    return NextResponse.json(
      { error: "This nurse doesn't treat that condition." },
      { status: 409 },
    );
  }

  const effective = await getEffectiveService(serviceId);
  const listPriceCents = effective?.defaultPriceCents ?? service.defaultPriceCents;
  const amountCents =
    payment === "comp"
      ? 0
      : Number.isFinite(Number(body.amountCents))
        ? Math.max(0, Math.round(Number(body.amountCents)))
        : listPriceCents;

  const client = await findOrCreateClient({
    email: clientEmail,
    displayName: clientName,
    phone: clientPhone,
    createdVia: "admin",
  });

  const end = start + service.durationMinutes * 60_000;
  let appointmentId: string;
  try {
    ({ appointmentId } = await createPendingAppointment({
      clientId: client.uid,
      providerId,
      serviceId,
      start,
      end,
      priceCents: amountCents,
      platformFeeCents: platformFeeCents(amountCents),
      holdExpiresAt: null,
      intake: note ? { concern: note, source: "admin" } : { source: "admin" },
      photoPaths: [],
      extra: { source: "admin", createdBy: admin.uid, paymentMethod: payment },
    }));
  } catch (e) {
    if (e instanceof SlotTakenError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  await confirmAppointmentBooked(appointmentId, {
    stripePaymentIntentId: `manual_${payment}_${appointmentId}`,
    amountCents,
    platformFeeCents: platformFeeCents(amountCents),
  });

  await adminDb.collection(COLLECTIONS.auditLogs).add({
    actorId: admin.uid,
    action: `appointment.create_manual.${payment}`,
    targetType: "appointment",
    targetId: appointmentId,
    meta: { clientId: client.uid, providerId, serviceId, start, amountCents },
    timestamp: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    appointmentId,
    clientId: client.uid,
    clientCreated: client.created,
    amountCents,
  });
}

/** GET /api/admin/appointments — recent appointments with party names. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await adminDb
    .collection(COLLECTIONS.appointments)
    .orderBy("start", "desc")
    .limit(100)
    .get();

  const nameCache = new Map<string, string>();
  async function name(uid: string) {
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const u = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    const n = u.get("displayName") ?? "—";
    nameCache.set(uid, n);
    return n;
  }

  const appointments = await Promise.all(
    snap.docs.map(async (d) => {
      const a = d.data();
      return {
        id: d.id,
        serviceId: a.serviceId,
        start: a.start,
        status: a.status,
        priceCents: a.priceCents,
        isLive: a.isLive === true,
        clientName: await name(a.clientId),
        providerName: await name(a.providerId),
      };
    }),
  );

  return NextResponse.json({ appointments });
}
