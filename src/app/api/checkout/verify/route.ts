import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe";
import { confirmAppointmentBooked } from "@/lib/appointments-server";

/**
 * POST /api/checkout/verify { appointmentId, sessionId }
 * Verifies a Stripe Checkout Session was paid and confirms the booking. Called
 * when the client returns from Stripe. Complements the webhook (whichever runs
 * first wins; confirmAppointmentBooked is idempotent).
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { appointmentId, sessionId } = await req.json().catch(() => ({}));
  if (!appointmentId || !sessionId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const apptRef = adminDb.collection(COLLECTIONS.appointments).doc(appointmentId);
  const snap = await apptRef.get();
  if (!snap.exists || snap.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (snap.get("status") !== "pending_payment") {
    return NextResponse.json({ ok: true, alreadyBooked: true });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.appointmentId !== appointmentId) {
    return NextResponse.json({ error: "Session mismatch" }, { status: 400 });
  }
  if (session.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Payment not completed", paymentStatus: session.payment_status },
      { status: 402 },
    );
  }

  await confirmAppointmentBooked(appointmentId, {
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : undefined,
    amountCents: session.amount_total ?? snap.get("priceCents"),
    platformFeeCents: snap.get("platformFeeCents") ?? 0,
  });

  return NextResponse.json({ ok: true });
}
