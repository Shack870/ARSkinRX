"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Loader2, TrendingUp } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Card } from "@/components/ui/card";

interface ProviderRow {
  providerId: string;
  name: string;
  completed: number;
  noShow: number;
  cancelled: number;
  live: number;
  grossCents: number;
  platformCents: number;
  earningsCents: number;
  paidOutCents: number;
  pendingCents: number;
  noShowRate: number;
}
interface Totals {
  grossCents: number;
  platformCents: number;
  earningsCents: number;
  completed: number;
  live: number;
}

export default function AdminRevenuePage() {
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [totals, setTotals] = React.useState<Totals | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    authedFetch("/api/admin/revenue")
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers ?? []);
        setTotals(d.totals ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  function exportCsv() {
    downloadCsv(
      "arskinrx-revenue-by-nurse.csv",
      providers.map((p) => ({
        nurse: p.name,
        completed_visits: p.completed,
        live_visits: p.live,
        no_shows: p.noShow,
        cancelled: p.cancelled,
        no_show_rate: `${Math.round(p.noShowRate * 100)}%`,
        gross: (p.grossCents / 100).toFixed(2),
        platform_revenue: (p.platformCents / 100).toFixed(2),
        nurse_earnings: (p.earningsCents / 100).toFixed(2),
        paid_out: (p.paidOutCents / 100).toFixed(2),
        pending: (p.pendingCents / 100).toFixed(2),
      })),
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
          <p className="text-[var(--muted-foreground)]">
            Combined revenue and per-nurse performance. Nurses earn 50% of each
            visit.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={providers.length === 0}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Gross revenue" value={formatCurrency(totals?.grossCents ?? 0)} highlight />
            <Stat label="Platform revenue (50%)" value={formatCurrency(totals?.platformCents ?? 0)} />
            <Stat label="Paid to nurses (50%)" value={formatCurrency(totals?.earningsCents ?? 0)} />
            <Stat label="Completed visits" value={String(totals?.completed ?? 0)} />
          </div>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--primary)]" />
              <h2 className="font-semibold">By nurse</h2>
            </div>
            {providers.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                No completed visits yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      <th className="py-2 pr-3">Nurse</th>
                      <th className="py-2 pr-3">Visits</th>
                      <th className="py-2 pr-3">Live</th>
                      <th className="py-2 pr-3">No-show</th>
                      <th className="py-2 pr-3">Gross</th>
                      <th className="py-2 pr-3">Platform</th>
                      <th className="py-2">Nurse earns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => (
                      <tr key={p.providerId} className="border-b border-[var(--border)]">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/admin/providers/${p.providerId}`}
                            className="font-medium hover:text-[var(--primary)]"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{p.completed}</td>
                        <td className="py-2 pr-3">{p.live}</td>
                        <td className="py-2 pr-3">
                          {p.noShow}
                          {p.completed + p.noShow > 0 && (
                            <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                              ({Math.round(p.noShowRate * 100)}%)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{formatCurrency(p.grossCents)}</td>
                        <td className="py-2 pr-3">{formatCurrency(p.platformCents)}</td>
                        <td className="py-2 font-medium text-[var(--primary)]">
                          {formatCurrency(p.earningsCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className="p-4">
      <p
        className={
          "text-2xl font-semibold tracking-tight " +
          (highlight ? "text-[var(--primary)]" : "")
        }
      >
        {value}
      </p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
    </Card>
  );
}
