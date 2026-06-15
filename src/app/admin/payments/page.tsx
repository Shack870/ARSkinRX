"use client";

import * as React from "react";
import { Download, Loader2, Search } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

interface AdminPayment {
  id: string;
  appointmentId: string;
  amountCents: number;
  refundedCents: number;
  status: string;
  createdAt: number;
  clientName: string;
  providerName: string;
  isDev: boolean;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = React.useState<AdminPayment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const confirm = useConfirm();
  const toast = useToast();

  const load = React.useCallback(() => {
    authedFetch("/api/admin/payments")
      .then((r) => r.json())
      .then((d) => setPayments(d.payments ?? []))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  const filtered = payments.filter((p) => {
    const s = q.toLowerCase();
    return (
      !s ||
      p.clientName.toLowerCase().includes(s) ||
      p.providerName.toLowerCase().includes(s)
    );
  });

  function exportCsv() {
    downloadCsv(
      "arskinrx-payments.csv",
      filtered.map((p) => ({
        date: formatDate(p.createdAt),
        patient: p.clientName,
        provider: p.providerName,
        amount: (p.amountCents / 100).toFixed(2),
        refunded: (p.refundedCents / 100).toFixed(2),
        status: p.status,
      })),
    );
  }

  async function refund(id: string, force = false) {
    if (
      !force &&
      !(await confirm({
        title: "Refund this payment?",
        message: "This refunds the full remaining amount.",
        confirmLabel: "Refund",
        destructive: true,
      }))
    )
      return;
    setBusy(id);
    try {
      const res = await authedFetch(`/api/admin/payments/${id}/refund`, {
        method: "POST",
        body: JSON.stringify({ force }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.error === "within_48h") {
        setBusy(null);
        if (
          await confirm({
            title: "Within 48 hours",
            message: `${d.message} Override and refund anyway?`,
            confirmLabel: "Override & refund",
            destructive: true,
          })
        ) {
          refund(id, true);
        }
        return;
      }
      if (!res.ok) toast.error("Refund failed", d.error);
      else toast.success("Refund issued");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          placeholder="Search patient or provider"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="p-6">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {payments.length === 0 ? "No payments yet." : "No matches."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Patient</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const refundable =
                    p.status === "succeeded" || p.status === "partially_refunded";
                  return (
                    <tr key={p.id} className="border-b border-[var(--border)]">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {formatDate(p.createdAt)}
                      </td>
                      <td className="py-2 pr-3">{p.clientName}</td>
                      <td className="py-2 pr-3">{p.providerName}</td>
                      <td className="py-2 pr-3">
                        {formatCurrency(p.amountCents)}
                        {p.refundedCents > 0 && (
                          <span className="ml-1 text-xs text-[var(--accent)]">
                            (−{formatCurrency(p.refundedCents)})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant={
                            p.status === "succeeded"
                              ? "success"
                              : p.status === "refunded"
                                ? "danger"
                                : "default"
                          }
                        >
                          {p.status.replace("_", " ")}
                        </Badge>
                        {p.isDev && (
                          <Badge className="ml-1" variant="warning">
                            dev
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {refundable && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === p.id}
                            onClick={() => refund(p.id)}
                          >
                            {busy === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Refund
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
