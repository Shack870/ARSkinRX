import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { getStripe } from "@/lib/stripe";

/**
 * Creates (or reuses) a Stripe Connect Express account for the provider and
 * returns an onboarding link. The provider is sent to Stripe to enter their
 * banking details so we can pay out their share of each visit.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.role !== "provider") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments are not configured yet. Add Stripe keys to enable." },
      { status: 503 },
    );
  }

  const providerRef = adminDb.collection(COLLECTIONS.providers).doc(uid);
  const snap = await providerRef.get();
  let accountId = snap.get("stripeAccountId") as string | undefined;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      country: "US",
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_type: "individual",
      metadata: { uid },
    });
    accountId = account.id;
    await providerRef.update({ stripeAccountId: accountId, updatedAt: Date.now() });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/provider/earnings?refresh=1`,
    return_url: `${appUrl}/provider/earnings?connected=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
