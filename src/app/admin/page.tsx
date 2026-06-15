"use client";

import * as React from "react";
import Link from "next/link";
import {
  Clock,
  CreditCard,
  Stethoscope,
  CalendarRange,
  Wallet,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
            <Card className="border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <p className="text-sm font-medium text-amber-800">
                    {data.pendingProviders} provider
                    {data.pendingProviders > 1 ? "s" : ""} awaiting approval
                  </p>
                </div>
                <Link href="/admin/providers">
                  <Button size="sm">Review</Button>
                </Link>
              </div>
            </Card>
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
