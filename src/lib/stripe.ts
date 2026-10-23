import "server-only";

import Stripe from "stripe";

let cached: Stripe | null = null;

/** Returns a configured Stripe client, or null if keys aren't set yet. */
export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key);
  return cached;
}

// Platform keeps this share of each visit; the rest is the nurse's earnings.
// 5000 bps = 50% (a 50/50 split).
export const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? "5000");

/** Platform fee in cents for a given gross amount. */
export function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10000);
}

/**
 * A nurse's Express account can receive the destination-charge split only once
 * Stripe has everything it needs: onboarding finished, charges allowed, and
 * payouts to their bank/debit card enabled.
 */
export function isConnectAccountReady(account: Stripe.Account): boolean {
  return (
    account.details_submitted === true &&
    account.charges_enabled === true &&
    account.payouts_enabled === true
  );
}

/**
 * Stripe returns this when the platform hasn't finished signing up for Connect
 * in the Dashboard. We surface a friendly message instead of a 500.
 */
export function isConnectNotEnabledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /signed up for Connect/i.test(msg);
}
