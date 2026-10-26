import "server-only";

import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { claimsGrantAdmin } from "@/lib/api-auth";
import { transferLiveVisitShare } from "@/lib/connect-server";
import { sendEmail } from "@/lib/notify";
import { getStripe } from "@/lib/stripe";
import { formatCurrency } from "@/lib/utils";

/** Nurses are paid once a week, every Friday. */
export const WEEKLY_PAYOUT_SCHEDULE: Stripe.AccountUpdateParams.Settings.Payouts.Schedule =
  { interval: "weekly", weekly_anchor: "friday" };

const PAYOUT_TZ = "America/Chicago";
const SETTINGS_DOC = "payouts";

/**
 * Pins a nurse's Stripe Express account to the weekly-Friday payout schedule.
 * Idempotent; safe to call on every run.
 */
export async function applyWeeklyPayoutSchedule(
  stripe: Stripe,
  accountId: string,
): Promise<void> {
  await stripe.accounts.update(accountId, {
    settings: { payouts: { schedule: WEEKLY_PAYOUT_SCHEDULE } },
  });
}

/** "YYYY-MM-DD" and weekday for `now` in the clinic's time zone. */
function localDate(now = new Date()): { key: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PAYOUT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
  };
}

/** The owner (admin claim or admin role) stays on manual payouts. */
async function isOwnerAccount(uid: string): Promise<boolean> {
  try {
    const u = await adminAuth.getUser(uid);
    if (claimsGrantAdmin(u.customClaims ?? {})) return true;
  } catch {
    // fall through to the profile check
  }
  const doc = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
  return doc.get("role") === "admin";
}

export interface WeeklyPayoutResult {
  /** False when today isn't payout day or this week's run already happened. */
  ran: boolean;
  providers: number;
  transfers: number;
  amountCents: number;
  errors: number;
}

/**
 * Friday payout run for approved nurses who have finished Stripe setup.
 *
 * Most of their money is already split at checkout (destination charges) or
 * on completion (live visits), and Stripe pays their balance out every Friday
 * because of `WEEKLY_PAYOUT_SCHEDULE`. This pass covers the rest: completed
 * visits that were still owed manually (e.g. booked before they onboarded)
 * get transferred so nothing is left behind, and each account's schedule is
 * re-pinned to weekly/Friday. Runs once per Friday (clinic time); the owner's
 * own provider account is skipped and stays manual.
 */
export async function runWeeklyPayouts(now = new Date()): Promise<WeeklyPayoutResult> {
  const result: WeeklyPayoutResult = {
    ran: false,
    providers: 0,
    transfers: 0,
    amountCents: 0,
    errors: 0,
  };
  const { key, weekday } = localDate(now);
  if (weekday !== "Fri") return result;

  const stripe = getStripe();
  if (!stripe) return result;

  const settingsRef = adminDb.collection(COLLECTIONS.settings).doc(SETTINGS_DOC);

  // Claim this Friday atomically so overlapping sweeps don't double-run.
  const claimed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(settingsRef);
    if (snap.get("lastWeeklyRunKey") === key) return false;
    tx.set(
      settingsRef,
      { lastWeeklyRunKey: key, lastWeeklyRunStartedAt: Date.now() },
      { merge: true },
    );
    return true;
  });
  if (!claimed) return result;
  result.ran = true;

  const providersSnap = await adminDb
    .collection(COLLECTIONS.providers)
    .where("status", "==", "approved")
    .where("stripeOnboardingComplete", "==", true)
    .get();

  for (const p of providersSnap.docs) {
    const providerId = p.id;
    const accountId = p.get("stripeAccountId") as string | undefined;
    if (!accountId) continue;
    if (await isOwnerAccount(providerId)) continue;
    result.providers++;

    try {
      await applyWeeklyPayoutSchedule(stripe, accountId);
    } catch (err) {
      result.errors++;
      console.error("[payouts] schedule update failed", providerId, err);
    }

    const owedSnap = await adminDb
      .collection(COLLECTIONS.appointments)
      .where("providerId", "==", providerId)
      .where("status", "==", "completed")
      .get();
    const owed = owedSnap.docs.filter(
      (d) =>
        !d.get("providerPaidAt") &&
        d.get("payoutVia") !== "stripe" &&
        !d.get("stripeTransferId") &&
        typeof d.get("stripePaymentIntentId") === "string" &&
        String(d.get("stripePaymentIntentId")).startsWith("pi_"),
    );
    if (owed.length === 0) continue;

    const transferred: { id: string; cents: number }[] = [];
    for (const d of owed) {
      try {
        await transferLiveVisitShare(d.id);
        const after = await d.ref.get();
        if (after.get("stripeTransferId")) {
          transferred.push({
            id: d.id,
            cents: (after.get("priceCents") ?? 0) - (after.get("platformFeeCents") ?? 0),
          });
        }
      } catch (err) {
        result.errors++;
        console.error("[payouts] transfer failed", d.id, err);
      }
    }
    if (transferred.length === 0) continue;

    const amountCents = transferred.reduce((s, t) => s + t.cents, 0);
    result.transfers += transferred.length;
    result.amountCents += amountCents;

    const payoutRef = adminDb.collection(COLLECTIONS.payouts).doc();
    const batch = adminDb.batch();
    batch.set(payoutRef, {
      id: payoutRef.id,
      providerId,
      amountCents,
      appointmentIds: transferred.map((t) => t.id),
      method: "stripe",
      note: "Weekly automatic transfer (Friday)",
      createdBy: "system",
      createdAt: Date.now(),
    });
    batch.set(adminDb.collection(COLLECTIONS.auditLogs).doc(), {
      actorId: "system",
      action: "payout.weekly",
      targetType: "provider",
      targetId: providerId,
      meta: { amountCents, visits: transferred.length, method: "stripe" },
      timestamp: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    try {
      const u = await adminDb.collection(COLLECTIONS.users).doc(providerId).get();
      const email = u.get("email");
      if (email) {
        await sendEmail({
          to: email,
          subject: "Your ARSkinRX weekly payout",
          html: `<p>Your share of ${transferred.length} completed visit${
            transferred.length === 1 ? "" : "s"
          } (${formatCurrency(amountCents)}) has been sent to your Stripe account. Stripe deposits your balance to your bank or debit card every Friday.</p>`,
        });
      }
    } catch {
      // non-critical
    }
  }

  await settingsRef.set(
    {
      lastWeeklyRunFinishedAt: Date.now(),
      lastWeeklyRunSummary: {
        providers: result.providers,
        transfers: result.transfers,
        amountCents: result.amountCents,
        errors: result.errors,
      },
    },
    { merge: true },
  );
  return result;
}
