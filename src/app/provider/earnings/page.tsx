"use client";

import * as React from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProviderAppointments, useProviderPayouts } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { LiveBadge } from "@/components/live/live-badge";
import { PayoutSetupCard } from "@/components/provider/payout-setup-card";
import type { Appointment, Payout } from "@/lib/types";

/** The provider's share of a visit (gross minus the platform fee). */
function share(a: Appointment) {
  return a.priceCents - a.platformFeeCents;
}

/** Split automatically through Stripe Connect — already the nurse's money. */
function viaStripe(a: Appointment) {
  return a.payoutVia === "stripe" || Boolean(a.stripeTransferId);
}

/** Paid either by a recorded manual payout or automatically via Stripe. */
function isPaid(a: Appointment) {
  return Boolean(a.providerPaidAt) || viaStripe(a);
}

function sum(list: Appointment[]) {
  return list.reduce((s, a) => s + share(a), 0);
}

/** Local-time start of the current week (Sunday) and month. */
function periodStarts(now = new Date()) {
  const week = new Date(now);
  week.setHours(0, 0, 0, 0);
  week.setDate(week.getDate() - week.getDay());
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  return { week: week.getTime(), month: month.getTime() };
}

export default function EarningsPage() {
  const { user } = useAuth();
  const { appointments, loading: apptsLoading } = useProviderAppointments(
    user?.uid,
  );
  const { payouts, loading: payoutsLoading } = useProviderPayouts(user?.uid);

  const completed = React.useMemo(
    () =>
      appointments
        .filter((a) => a.status === "completed")
        .sort((a, b) => b.start - a.start),
    [appointments],
  );

  const paid = completed.filter(isPaid);
  const unpaid = completed.filter((a) => !isPaid(a));
  const autoPaid = completed.filter(viaStripe);
  const paidOut = sum(paid);
  const pending = sum(unpaid);
  const lifetime = paidOut + pending;

  const { week, month } = periodStarts();
  const thisWeek = sum(completed.filter((a) => a.start >= week));
  const thisMonth = sum(completed.filter((a) => a.start >= month));
  const grossLifetime = completed.reduce((s, a) => s + a.priceCents, 0);
  const sharePct =
    grossLifetime > 0 ? Math.round((lifetime / grossLifetime) * 100) : 50;

  const loading = apptsLoading || payoutsLoading;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
        <p className="text-[var(--muted-foreground)]">
          Your share of every completed visit, what&apos;s been paid, and
          what&apos;s still owed to you.
        </p>
      </div>

      <PayoutSetupCard />

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Wallet className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
          <div>
            <h2 className="font-semibold">How payouts work</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              You earn {sharePct}% of each completed visit. With Stripe payouts
              active, your share is split off automatically when the patient
              pays and deposited to your bank or debit card on Stripe&apos;s
              schedule. Visits before that (or if you haven&apos;t set up
              Stripe) are paid by ARSkinRX directly — Zelle, check, or ACH —
              and marked here once sent, with a confirmation by email/text.
            </p>
          </div>
        </div>
      </Card>

      {/* Headline numbers */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="mt-2 h-3 w-16" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat
            label="Total earned (your share)"
            value={formatCurrency(lifetime)}
            sub={`${completed.length} completed visit${completed.length === 1 ? "" : "s"}`}
          />
          <Stat
            label="Paid out so far"
            value={formatCurrency(paidOut)}
            sub={
              autoPaid.length > 0
                ? `${autoPaid.length} via Stripe · ${payouts.length} manual payout${payouts.length === 1 ? "" : "s"}`
                : `${payouts.length} payout${payouts.length === 1 ? "" : "s"}`
            }
          />
          <Stat
            label="Pending manual payout"
            value={formatCurrency(pending)}
            sub={`${unpaid.length} unpaid visit${unpaid.length === 1 ? "" : "s"}`}
            highlight
          />
        </div>
      )}

      {/* Period summary */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4">
          <Stat label="This week" value={formatCurrency(thisWeek)} compact />
          <Stat label="This month" value={formatCurrency(thisMonth)} compact />
        </div>
      )}

      {/* Per-visit line items */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Visit earnings</h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            Gross · your share
          </span>
        </div>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : completed.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            No completed visits yet. Your share of each visit will appear here
            as soon as it&apos;s completed.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {completed.map((a) => (
              <VisitRow key={a.id} appt={a} />
            ))}
          </ul>
        )}
      </Card>

      {/* Manual payout history (Stripe-split visits are tracked in Stripe) */}
      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Manual payout history</h2>
        {loading ? (
          <SkeletonRows rows={2} />
        ) : payouts.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            No payouts sent yet.
            {pending > 0 &&
              ` ${formatCurrency(pending)} is pending and will show here once sent.`}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {payouts.map((p) => (
              <PayoutRow key={p.id} payout={p} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function VisitRow({ appt }: { appt: Appointment }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <Link
          href={`/provider/appointments/${appt.id}`}
          className="flex items-center gap-2 font-medium hover:text-[var(--primary)]"
        >
          <span className="truncate">
            {SERVICE_MAP[appt.serviceId]?.name ?? appt.serviceId}
          </span>
          {appt.isLive && <LiveBadge />}
        </Link>
        <p className="text-sm text-[var(--muted-foreground)]">
          {formatDateTime(appt.start)}
          {appt.providerPaidAt && (
            <span> · Paid {formatDate(appt.providerPaidAt)}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {viaStripe(appt) ? (
          <Badge variant="success">Paid via Stripe</Badge>
        ) : appt.providerPaidAt ? (
          <Badge variant="success">Paid</Badge>
        ) : (
          <Badge variant="warning">Pending</Badge>
        )}
        <div className="text-right">
          <p className="font-medium text-[var(--primary)]">
            +{formatCurrency(share(appt))}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            of {formatCurrency(appt.priceCents)}
          </p>
        </div>
      </div>
    </li>
  );
}

function PayoutRow({ payout }: { payout: Payout }) {
  const visits = payout.appointmentIds?.length ?? 0;
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {formatCurrency(payout.amountCents)}
          <Badge variant="primary">{payout.method}</Badge>
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {formatDateTime(payout.createdAt)} · {visits} visit
          {visits === 1 ? "" : "s"}
          {payout.note && <span> · {payout.note}</span>}
        </p>
        <p className="font-mono text-xs text-[var(--muted-foreground)]">
          Ref {payout.id.slice(0, 8).toUpperCase()}
        </p>
      </div>
      <Badge variant="success">Sent</Badge>
    </li>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
  compact,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <Card className="p-4">
      <p
        className={
          (compact ? "text-xl" : "text-2xl") +
          " font-semibold tracking-tight " +
          (highlight ? "text-[var(--primary)]" : "")
        }
      >
        {value}
      </p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
      {sub && (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{sub}</p>
      )}
    </Card>
  );
}
