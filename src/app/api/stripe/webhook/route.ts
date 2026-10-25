import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getStripe, isConnectAccountReady } from "@/lib/stripe";
import { confirmAppointmentBooked } from "@/lib/appointments-server";
import { markLivePaidAndMatch } from "@/lib/live-server";

// Stripe needs the raw request body to verify the signature.
export const runtime = "nodejs";

/**
 * Two Stripe endpoints post here, each with its own signing secret:
 *  - the platform endpoint (checkout.session.completed, etc.)
 *  - the Connect endpoint (connected-account events such as account.updated
 *    for the nurses' Express accounts, which Stripe only delivers to an
 *    endpoint created with `connect=true`).
 * We try the primary secret first, then the Connect one.
 */
function verifyEvent(stripe: Stripe, raw: string, sig: string): Stripe.Event | null {
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter((s): s is string => Boolean(s));
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(raw, sig, secret);
    } catch {
      // try the next secret
    }
  }
  return null;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  if (
    !stripe ||
    (!process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_CONNECT_WEBHOOK_SECRET)
  ) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  const event = verifyEvent(stripe, raw, sig);
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const appointmentId = session.metadata?.appointmentId;
      if (appointmentId) {
        await confirmAppointmentBooked(appointmentId, {
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : undefined,
          amountCents: session.amount_total ?? 0,
          // Fee is recorded on the appointment; confirmAppointmentBooked falls
          // back to it when we don't pass one here.
          payoutVia: session.metadata?.payoutVia === "stripe" ? "stripe" : "manual",
        });
      }
      const liveRequestId = session.metadata?.liveRequestId;
      if (liveRequestId && session.payment_status === "paid") {
        // Start matching the nurse even if the patient never lands back on
        // our page (closed tab, lost session, different origin).
        await markLivePaidAndMatch(
          liveRequestId,
          typeof session.payment_intent === "string" ? session.payment_intent : null,
        );
      }
      break;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const complete = isConnectAccountReady(account);
      const snap = await adminDb
        .collection(COLLECTIONS.providers)
        .where("stripeAccountId", "==", account.id)
        .limit(1)
        .get();
      if (!snap.empty) {
        await snap.docs[0].ref.update({
          stripeOnboardingComplete: complete,
          updatedAt: Date.now(),
        });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
