"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Banknote, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProviderProfile } from "@/lib/hooks";
import { authedFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface PayoutSetupCardProps {
  /**
   * Compact mode renders a one-line nudge (for the provider overview) and
   * hides itself entirely once payouts are active.
   */
  compact?: boolean;
  className?: string;
}

/**
 * Stripe Connect (Express) onboarding card for nurses.
 *
 * - Not onboarded → explains automatic payouts and offers "Set up payouts",
 *   which calls /api/stripe/connect and sends them to Stripe's hosted flow.
 * - Onboarded → "Payouts active" plus "Manage in Stripe" (Express dashboard
 *   login link from /api/stripe/connect/login).
 *
 * When Stripe returns the nurse to /provider/earnings?connect=return (or
 * ?connect=refresh), the card re-syncs their status via
 * /api/stripe/connect/status and cleans the query string.
 */
export function PayoutSetupCard(props: PayoutSetupCardProps) {
  // useSearchParams needs a Suspense boundary; keep that detail inside the
  // component so pages can just drop it in.
  return (
    <Suspense fallback={null}>
      <PayoutSetupCardInner {...props} />
    </Suspense>
  );
}

function PayoutSetupCardInner({ compact, className }: PayoutSetupCardProps) {
  const { user } = useAuth();
  const { profile: provider, loading } = useProviderProfile(user?.uid);
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = React.useState<"start" | "manage" | "sync" | null>(null);
  const [requirementsDue, setRequirementsDue] = React.useState<string[]>([]);
  const syncedRef = React.useRef(false);

  const onboarded = provider?.stripeOnboardingComplete === true;
  const hasAccount = Boolean(provider?.stripeAccountId);
  const connectParam = search.get("connect");

  const syncStatus = React.useCallback(async () => {
    setBusy("sync");
    try {
      const res = await authedFetch("/api/stripe/connect/status", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't check payout status", d.error);
        return;
      }
      setRequirementsDue(Array.isArray(d.requirementsDue) ? d.requirementsDue : []);
      if (d.onboarded) {
        toast.success(
          "Payouts active",
          "Your share of each visit is deposited to your bank or debit card every Friday.",
        );
      } else if (d.hasAccount) {
        toast.info(
          "Almost there",
          "Stripe still needs a few details before payouts can start. Tap “Finish setup” to continue.",
        );
      }
    } finally {
      setBusy(null);
    }
  }, [toast]);

  // Returning from Stripe: re-check once, then drop the ?connect= param.
  React.useEffect(() => {
    if (!connectParam || syncedRef.current || !user) return;
    syncedRef.current = true;
    void syncStatus().finally(() => {
      const params = new URLSearchParams(search.toString());
      params.delete("connect");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    });
  }, [connectParam, user, syncStatus, search, router]);

  async function startOnboarding() {
    setBusy("start");
    try {
      const res = await authedFetch("/api/stripe/connect", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) {
        if (d.connectUnavailable) {
          toast.info("Automatic payouts coming soon", d.error);
        } else {
          toast.error("Couldn't start payout setup", d.error);
        }
        return;
      }
      window.location.assign(d.url);
    } catch (err) {
      toast.error(
        "Couldn't start payout setup",
        err instanceof Error ? err.message : undefined,
      );
      setBusy(null);
    }
  }

  async function manageInStripe() {
    setBusy("manage");
    try {
      const res = await authedFetch("/api/stripe/connect/login", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) {
        toast.error("Couldn't open Stripe", d.error);
        return;
      }
      window.open(d.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  }

  if (!user || loading || !provider) return null;

  // ── Compact nudge (provider overview) ──
  if (compact) {
    if (onboarded) return null;
    return (
      <Card className={`border-[var(--primary)]/30 bg-[var(--primary-soft)]/40 p-4 ${className ?? ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
            <div>
              <p className="font-medium">
                {hasAccount ? "Finish setting up payouts" : "Get paid automatically"}
              </p>
              <p className="text-sm text-[var(--muted-foreground)]">
                Connect a bank or debit card through Stripe and your share of
                each visit is deposited for you.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={startOnboarding} disabled={busy !== null}>
            {busy === "start" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {hasAccount ? "Finish setup" : "Set up payouts"}
          </Button>
        </div>
      </Card>
    );
  }

  // ── Full card (earnings page) ──
  if (onboarded) {
    return (
      <Card className={`p-6 ${className ?? ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                Payouts active
                <Badge variant="success">Auto (Stripe)</Badge>
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Your share of every paid visit goes to your Stripe balance
                automatically, and Stripe deposits it to your bank or debit
                card once a week, every Friday. Stripe also handles your
                year-end 1099. We never see your banking details.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={manageInStripe}
            disabled={busy !== null}
          >
            {busy === "manage" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Manage in Stripe
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`border-[var(--primary)]/30 bg-[var(--primary-soft)]/40 p-6 ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
          <div>
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              {hasAccount ? "Finish setting up payouts" : "Set up automatic payouts"}
              <Badge variant="warning">Manual for now</Badge>
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Get paid automatically to your bank or debit card via Stripe,
              once a week every Friday. We never see your banking details —
              Stripe collects them securely, deposits your share of each
              visit, and handles your 1099.
            </p>
            {hasAccount && requirementsDue.length > 0 && (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                Stripe still needs: {requirementsDue.slice(0, 4).join(", ")}
                {requirementsDue.length > 4 ? "…" : ""}
              </p>
            )}
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Until then, ARSkinRX pays you manually (Zelle, check, or ACH) and
              records each payout below.{" "}
              <Link
                href="https://stripe.com/connect"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-[var(--primary)]"
              >
                About Stripe
              </Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasAccount && (
            <Button
              variant="ghost"
              size="sm"
              onClick={syncStatus}
              disabled={busy !== null}
            >
              {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Re-check
            </Button>
          )}
          <Button size="sm" onClick={startOnboarding} disabled={busy !== null}>
            {busy === "start" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {hasAccount ? "Finish setup" : "Set up payouts"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
