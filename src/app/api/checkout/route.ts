import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import { getStripe } from "@/lib/stripe";
import { confirmAppointmentBooked } from "@/lib/appointments-server";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType } from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * POST /api/checkout { appointmentId }
 * Starts payment for a pending appointment.
 * - If Stripe is configured, returns a Checkout Session URL (destination
 *   charge to the provider's Connect account, minus the platform fee).
 * - If Stripe isn't configured yet, books the appointment immediately so the
 *   flow is testable in development, and returns a redirect URL.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "checkout", 20);
  if (limited) return limited;

  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { appointmentId } = await req.json().catch(() => ({}));
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const apptRef = adminDb.collection(COLLECTIONS.appointments).doc(appointmentId);
  const snap = await apptRef.get();
  if (!snap.exists || snap.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const appt = snap.data()!;
  if (appt.status !== "pending_payment") {
    // Already booked — just send them to the appointment.
    return NextResponse.json({
      url: `${APP_URL}/dashboard/appointments/${appointmentId}`,
    });
  }
  if ((appt.holdExpiresAt ?? 0) < Date.now()) {
    return NextResponse.json(
      { error: "Your hold expired. Please pick a time again." },
      { status: 410 },
    );
  }

  const service = getService(appt.serviceId as ServiceType);
  const stripe = getStripe();

  // ── Dev bypass: no Stripe keys yet → book immediately. ──
  if (!stripe) {
    await confirmAppointmentBooked(appointmentId, {
      amountCents: appt.priceCents,
      platformFeeCents: appt.platformFeeCents,
      dev: true,
    });
    return NextResponse.json({
      devBypass: true,
      url: `${APP_URL}/dashboard/appointments/${appointmentId}?paid=dev`,
    });
  }

  // ── Real Stripe Checkout ──
  const providerSnap = await adminDb
    .collection(COLLECTIONS.providers)
    .doc(appt.providerId)
    .get();
  const destination = providerSnap.get("stripeAccountId") as string | undefined;
  const onboarded = providerSnap.get("stripeOnboardingComplete") === true;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${service?.name ?? "Visit"} — ARSkinRX`,
            description: "Virtual skin care visit",
          },
          unit_amount: appt.priceCents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data:
      destination && onboarded
        ? {
            application_fee_amount: appt.platformFeeCents,
            transfer_data: { destination },
          }
        : undefined,
    metadata: { appointmentId },
    success_url: `${APP_URL}/dashboard/appointments/${appointmentId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/dashboard/appointments/${appointmentId}?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
