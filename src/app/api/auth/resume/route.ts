import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getStripe } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";

/** A paid Checkout session can resume its guest account for this long. */
const RESUME_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * POST /api/auth/resume { sessionId }
 *
 * A patient who booked as a guest and paid can land back on the site without
 * a Firebase session (different origin, cleared storage, opened the Stripe
 * receipt on another device). Rather than dead-end them at a login screen for
 * an account that has no password yet, accept the *paid* Stripe Checkout
 * session id — an unguessable secret only the payer's browser holds — as
 * proof and mint a short-lived sign-in for the account that paid.
 *
 * Deliberately narrow: only password-less guest accounts (passwordSet===false),
 * only within two hours of payment, and the token carries the client role.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "resume", 10);
  if (limited) return limited;

  const { sessionId } = await req.json().catch(() => ({}));
  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const session = await stripe.checkout.sessions
    .retrieve(sessionId)
    .catch(() => null);
  if (!session || session.payment_status !== "paid") {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (Date.now() - session.created * 1000 > RESUME_WINDOW_MS) {
    return NextResponse.json({ error: "Resume window expired" }, { status: 410 });
  }

  // Resolve the paying account from what the session was for.
  let uid: string | null = null;
  if (session.metadata?.liveRequestId) {
    const r = await adminDb
      .collection(COLLECTIONS.liveRequests)
      .doc(session.metadata.liveRequestId)
      .get();
    uid = r.get("clientId") ?? null;
  } else if (session.metadata?.appointmentId) {
    const a = await adminDb
      .collection(COLLECTIONS.appointments)
      .doc(session.metadata.appointmentId)
      .get();
    uid = a.get("clientId") ?? null;
  }
  if (!uid) return NextResponse.json({ error: "No account" }, { status: 404 });

  const profile = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
  if (!profile.exists || profile.get("passwordSet") !== false) {
    // Established accounts sign in normally.
    return NextResponse.json({ error: "Sign in required" }, { status: 403 });
  }

  const customToken = await adminAuth.createCustomToken(uid, { role: "client" });
  return NextResponse.json({ customToken, uid });
}
