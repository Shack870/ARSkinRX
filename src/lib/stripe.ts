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

export const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? "2000");

/** Platform fee in cents for a given gross amount. */
export function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10000);
}
