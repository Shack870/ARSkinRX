import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getStripe, isConnectNotEnabledError } from "@/lib/stripe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * POST /api/stripe/connect
 * Creates (or reuses) a Stripe Connect **Express** account for the nurse and
 * returns a hosted onboarding link. The nurse enters identity + bank/debit
 * details on Stripe's pages — we never see or store them. Once Stripe reports
 * the account ready, each paid visit is split automatically (see /api/checkout)
 * and Stripe handles their payouts and 1099s.
 */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user || user.role !== "provider") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments are not configured yet. Add Stripe keys to enable." },
      { status: 503 },
    );
  }

  const providerRef = adminDb.collection(COLLECTIONS.providers).doc(user.uid);
  const snap = await providerRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Provider profile not found" }, { status: 404 });
  }
  let accountId = snap.get("stripeAccountId") as string | undefined;

  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        country: "US",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        business_profile: {
          mcc: "8099", // Medical services, not elsewhere classified
          product_description:
            "Telehealth skin-care visits provided through the ARSkinRX marketplace.",
        },
        metadata: { uid: user.uid },
      });
      accountId = account.id;
      await providerRef.update({
        stripeAccountId: accountId,
        stripeOnboardingComplete: false,
        updatedAt: Date.now(),
      });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/provider/earnings?connect=refresh`,
      return_url: `${APP_URL}/provider/earnings?connect=return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (err) {
    if (isConnectNotEnabledError(err)) {
      return NextResponse.json(
        {
          error:
            "Automatic payouts aren't switched on yet. ARSkinRX will pay you manually in the meantime — nothing you need to do.",
          connectUnavailable: true,
        },
        { status: 503 },
      );
    }
    console.error("[stripe/connect]", err);
    return NextResponse.json(
      { error: "Couldn't start Stripe setup. Please try again." },
      { status: 502 },
    );
  }
}
