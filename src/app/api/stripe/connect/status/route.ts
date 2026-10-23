import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getStripe, isConnectAccountReady } from "@/lib/stripe";

/**
 * POST /api/stripe/connect/status
 * Re-checks the nurse's Stripe Connect account and syncs
 * `stripeOnboardingComplete` (details_submitted && charges_enabled &&
 * payouts_enabled). Called right after they return from Stripe onboarding;
 * the Connect webhook (account.updated) keeps it in sync afterwards.
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user || user.role !== "provider") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ onboarded: false, configured: false });
  }

  const ref = adminDb.collection(COLLECTIONS.providers).doc(user.uid);
  const accountId = (await ref.get()).get("stripeAccountId") as
    | string
    | undefined;
  if (!accountId) return NextResponse.json({ onboarded: false, hasAccount: false });

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const onboarded = isConnectAccountReady(account);
    await ref.update({
      stripeOnboardingComplete: onboarded,
      updatedAt: Date.now(),
    });
    return NextResponse.json({
      onboarded,
      hasAccount: true,
      detailsSubmitted: account.details_submitted === true,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true,
      // Anything Stripe still needs from the nurse (shown as a hint).
      requirementsDue: account.requirements?.currently_due ?? [],
    });
  } catch (err) {
    console.error("[stripe/connect/status]", err);
    return NextResponse.json(
      { error: "Couldn't check Stripe status. Please try again." },
      { status: 502 },
    );
  }
}
