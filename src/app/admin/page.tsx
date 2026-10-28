"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Clock,
  CreditCard,
  Stethoscope,
  CalendarRange,
  Wallet,
  RefreshCw,
  Loader2,
  Pill,
} from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { SERVICE_MAP } from "@/lib/services";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ServiceType } from "@/lib/types";

interface Overview {
  providers: number;
  pendingProviders: number;
  appointmentsToday: number;
  grossCents: number;
  platformCents: number;
  owedToProvidersCents: number;
  nursesOnline: number;
}

export default function AdminOverview() {
  const toast = useToast();
  const [data, setData] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sweeping, setSweeping] = React.useState(false);

  React.useEffect(() => {
    authedFetch("/api/admin/overview")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  async function runSweep() {
    setSweeping(true);
    try {
      const res = await authedFetch("/api/admin/run-sweep", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error();
      toast.success(
        "Maintenance run complete",
        `${d.noShows} no-shows · ${d.expiredHolds} holds released · ${d.reminders} reminders`,
      );
    } catch {
      toast.error("Couldn't run maintenance");
    } finally {
      setSweeping(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
        <Button variant="outline" size="sm" onClick={runSweep} disabled={sweeping}>
          {sweeping ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Run maintenance
        </Button>
      </div>

      <RxQueueBanner />

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      ) : !data ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Could not load stats.
        </p>
      ) : (
        <>
          {data.nursesOnline > 0 && (
            <Card className="border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                {data.nursesOnline} nurse{data.nursesOnline > 1 ? "s" : ""} live
                now for real-time visits
              </p>
            </Card>
          )}
          {data.pendingProviders > 0 && (
            <PendingApplications
              onChange={(delta) =>
                setData((d) =>
                  d
                    ? {
                        ...d,
                        pendingProviders: Math.max(0, d.pendingProviders + delta),
                        providers: d.providers + (delta < 0 ? 1 : 0),
                      }
                    : d,
                )
              }
            />
          )}
          {data.owedToProvidersCents > 0 && (
            <Card className="border-[var(--primary)] bg-[var(--primary-soft)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Wallet className="h-5 w-5 text-[var(--primary)]" />
                  <p className="text-sm font-medium text-[var(--primary)]">
                    {formatCurrency(data.owedToProvidersCents)} owed to providers
                    — ready to pay out
                  </p>
                </div>
                <Link href="/admin/payouts">
                  <Button size="sm">Pay out</Button>
                </Link>
              </div>
            </Card>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              icon={Stethoscope}
              tint="tint-teal"
              label="Providers"
              value={String(data.providers)}
            />
            <Stat
              icon={CalendarRange}
              tint="tint-sky"
              label="Visits today"
              value={String(data.appointmentsToday)}
            />
            <Stat
              icon={CreditCard}
              tint="tint-emerald"
              label="Gross revenue"
              value={formatCurrency(data.grossCents)}
            />
            <Stat
              icon={Wallet}
              tint="tint-amber"
              label="Owed to providers"
              value={formatCurrency(data.owedToProvidersCents)}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface PendingRow {
  uid: string;
  displayName: string;
  email: string;
  licenseNumber: string;
  conditions: ServiceType[];
  status: string;
  createdAt: number;
}

/** Nurse applications awaiting approval, approvable right from the overview. */
function PendingApplications({ onChange }: { onChange: (delta: number) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = React.useState<PendingRow[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    authedFetch("/api/admin/providers")
      .then((r) => r.json())
      .then((d) =>
        setRows(
          (d.providers ?? []).filter((p: PendingRow) => p.status === "pending"),
        ),
      )
      .catch(() => setRows([]));
  }, []);

  async function approve(p: PendingRow) {
    const ok = await confirm({
      title: `Approve ${p.displayName}?`,
      message: "They'll appear to patients immediately and can start taking visits.",
      confirmLabel: "Approve",
    });
    if (!ok) return;
    setBusy(p.uid);
    try {
      const res = await authedFetch(`/api/admin/providers/${p.uid}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error();
      setRows((r) => (r ?? []).filter((x) => x.uid !== p.uid));
      onChange(-1);
      toast.success("Nurse approved", `${p.displayName} is now live for bookings.`);
    } catch {
      toast.error("Couldn't approve", "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (rows && rows.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50 p-4">
      <div className="mb-3 flex items-center gap-3">
        <Clock className="h-5 w-5 text-amber-600" />
        <p className="text-sm font-medium text-amber-800">
          {rows ? `${rows.length} nurse application${rows.length > 1 ? "s" : ""} awaiting approval` : "Loading applications…"}
        </p>
      </div>
      {rows && (
        <ul className="divide-y divide-amber-200/70 rounded-[var(--radius-md)] border border-amber-200 bg-white">
          {rows.map((p) => (
            <li key={p.uid} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/providers/${p.uid}`}
                  className="font-medium hover:text-[var(--primary)]"
                >
                  {p.displayName}
                </Link>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {p.email} · License {p.licenseNumber || "—"} · Applied{" "}
                  {new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.conditions.slice(0, 4).map((c) => (
                    <Badge key={c}>{SERVICE_MAP[c]?.name ?? c}</Badge>
                  ))}
                  {p.conditions.length > 4 && (
                    <Badge>+{p.conditions.length - 4} more</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/admin/providers/${p.uid}`}>
                  <Button size="sm" variant="outline">
                    View
                  </Button>
                </Link>
                <Button size="sm" onClick={() => approve(p)} disabled={busy === p.uid}>
                  {busy === p.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tint = "tint-teal",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <Card className="p-4">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] ${tint}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
    </Card>
  );
}

/** Prescriptions waiting on the prescriber — the first thing she should see. */
function RxQueueBanner() {
  const [counts, setCounts] = React.useState<{ review: number; send: number } | null>(
    null,
  );
  React.useEffect(() => {
    authedFetch("/api/admin/prescriptions")
      .then((r) => r.json())
      .then((d) =>
        setCounts({
          review: Array.isArray(d.toReview) ? d.toReview.length : 0,
          send: Array.isArray(d.toSend) ? d.toSend.length : 0,
        }),
      )
      .catch(() => setCounts({ review: 0, send: 0 }));
  }, []);
  if (!counts || (counts.review === 0 && counts.send === 0)) return null;
  return (
    <Link href="/admin/prescriptions" className="block">
      <Card className="border-[var(--primary)]/40 bg-[var(--primary-soft)] p-4 transition-colors hover:bg-[var(--primary-soft)]/70">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Pill className="h-4 w-4 text-[var(--primary)]" />
          {counts.review > 0 && (
            <span>
              {counts.review} prescription{counts.review === 1 ? "" : "s"} to review
            </span>
          )}
          {counts.review > 0 && counts.send > 0 && <span>·</span>}
          {counts.send > 0 && (
            <span>
              {counts.send} to send to pharmacy
            </span>
          )}
          <span className="ml-auto text-[var(--primary)]">Open →</span>
        </p>
      </Card>
    </Link>
  );
}
