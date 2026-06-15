import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe";

/**
 * POST /api/stripe/connect/status
 * Re-checks the provider's Stripe Connect account and updates
 * stripeOnboardingComplete. Useful right after the provider returns from the
 * Stripe onboarding flow (the webhook also keeps this in sync).
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
  if (!accountId) return NextResponse.json({ onboarded: false });

  const account = await stripe.accounts.retrieve(accountId);
  const onboarded =
    account.details_submitted === true && account.charges_enabled === true;
  await ref.update({ stripeOnboardingComplete: onboarded, updatedAt: Date.now() });

  return NextResponse.json({ onboarded });
}
