import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe";
import { tryMatchLiveRequest, LIVE_SEARCH_MS } from "@/lib/live-server";

/**
 * POST /api/live/verify { liveRequestId, sessionId }
 * Verifies the Stripe session was paid, flips the request to searching, and
 * kicks off matching. Idempotent.
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { liveRequestId, sessionId } = await req.json().catch(() => ({}));
  if (!liveRequestId || !sessionId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const ref = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (snap.get("status") !== "pending_payment") {
    await tryMatchLiveRequest(liveRequestId);
    return NextResponse.json({ ok: true });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.liveRequestId !== liveRequestId) {
    return NextResponse.json({ error: "Session mismatch" }, { status: 400 });
  }
  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
  }

  await ref.update({
    status: "searching",
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    expiresAt: Date.now() + LIVE_SEARCH_MS,
    updatedAt: Date.now(),
  });
  const result = await tryMatchLiveRequest(liveRequestId);
  return NextResponse.json({ ok: true, ...result });
}
