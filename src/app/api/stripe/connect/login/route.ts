import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe";

/**
 * POST /api/stripe/connect/login
 * Returns a single-use link to the nurse's Stripe Express dashboard, where
 * they can see payouts, update their bank/debit card, and download tax forms.
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user || user.role !== "provider") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const snap = await adminDb.collection(COLLECTIONS.providers).doc(user.uid).get();
  const accountId = snap.get("stripeAccountId") as string | undefined;
  if (!accountId) {
    return NextResponse.json(
      { error: "Set up payouts first." },
      { status: 400 },
    );
  }

  try {
    const link = await stripe.accounts.createLoginLink(accountId);
    return NextResponse.json({ url: link.url });
  } catch (err) {
    console.error("[stripe/connect/login]", err);
    return NextResponse.json(
      { error: "Couldn't open your Stripe dashboard. Please try again." },
      { status: 502 },
    );
  }
}
