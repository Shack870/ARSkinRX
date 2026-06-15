import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getService } from "@/lib/services";
import { getStripe } from "@/lib/stripe";
import { tryMatchLiveRequest, LIVE_SEARCH_MS } from "@/lib/live-server";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType } from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * POST /api/live/checkout { liveRequestId }
 * Pays for a live request. Dev-bypass marks it paid and starts searching +
 * matching immediately; with Stripe it returns a Checkout URL.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "live-checkout", 20);
  if (limited) return limited;

  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { liveRequestId } = await req.json().catch(() => ({}));
  if (!liveRequestId) {
    return NextResponse.json({ error: "Missing liveRequestId" }, { status: 400 });
  }

  const ref = adminDb.collection(COLLECTIONS.liveRequests).doc(liveRequestId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("clientId") !== user.uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const lr = snap.data()!;
  if (lr.status !== "pending_payment") {
    return NextResponse.json({ url: `${APP_URL}/live/${liveRequestId}` });
  }

  const service = getService(lr.serviceId as ServiceType);
  const stripe = getStripe();

  // ── Dev bypass: no Stripe keys → mark paid and start searching now. ──
  if (!stripe) {
    await ref.update({
      status: "searching",
      expiresAt: Date.now() + LIVE_SEARCH_MS,
      updatedAt: Date.now(),
    });
    await tryMatchLiveRequest(liveRequestId);
    return NextResponse.json({
      devBypass: true,
      url: `${APP_URL}/live/${liveRequestId}`,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${service?.name ?? "Visit"} — No-Wait Live Visit`,
            description: "On-demand virtual skin care visit",
          },
          unit_amount: lr.priceCents,
        },
        quantity: 1,
      },
    ],
    metadata: { liveRequestId },
    success_url: `${APP_URL}/live/${liveRequestId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/book?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
