"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { formatDate } from "@/lib/datetime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

interface Outstanding {
  providerId: string;
  providerName: string;
  amountCents: number;
  visitCount: number;
}
interface HistoryItem {
  id: string;
  providerName: string;
  amountCents: number;
  method: string;
  note: string;
  visitCount: number;
  createdAt: number;
}

export default function AdminPayoutsPage() {
  const [outstanding, setOutstanding] = React.useState<Outstanding[]>([]);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [payingId, setPayingId] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState<Record<string, string>>({});
  const confirm = useConfirm();
  const toast = useToast();

  const load = React.useCallback(() => {
    authedFetch("/api/admin/payouts")
      .then((r) => r.json())
      .then((d) => {
        setOutstanding(d.outstanding ?? []);
        setHistory(d.history ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  async function pay(o: Outstanding) {
    const m = (method[o.providerId] ?? "").trim();
    if (!m) {
      toast.error("Add a payment method", "e.g. Zelle, Check, or ACH.");
      return;
    }
    if (
      !(await confirm({
        title: "Record this payout?",
        message: `Mark ${formatCurrency(o.amountCents)} as paid to ${o.providerName} via ${m}. The provider will be notified.`,
        confirmLabel: "Mark paid",
      }))
    )
      return;
    setPayingId(o.providerId);
    try {
      const res = await authedFetch("/api/admin/payouts", {
        method: "POST",
        body: JSON.stringify({
          providerId: o.providerId,
          method: m,
          note: note[o.providerId] ?? "",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("Couldn't record payout", d.error);
      } else {
        toast.success("Payout recorded");
      }
      load();
    } finally {
      setPayingId(null);
    }
  }

  const totalOwed = outstanding.reduce((s, o) => s + o.amountCents, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Provider payouts</h1>
        <p className="text-[var(--muted-foreground)]">
          Pay providers manually, then mark it here to send them a confirmation.
        </p>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      ) : (
        <>
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Outstanding</h2>
              <span className="text-sm text-[var(--muted-foreground)]">
                Total owed:{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {formatCurrency(totalOwed)}
                </span>
              </span>
            </div>
            {outstanding.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                Nothing outstanding — all providers are paid up.
              </p>
            ) : (
              <div className="space-y-4">
                {outstanding.map((o) => (
                  <div
                    key={o.providerId}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{o.providerName}</p>
                        <p className="text-sm text-[var(--muted-foreground)]">
                          {o.visitCount} visit{o.visitCount > 1 ? "s" : ""} awaiting
                          payout
                        </p>
                      </div>
                      <span className="text-lg font-semibold text-[var(--primary)]">
                        {formatCurrency(o.amountCents)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`m-${o.providerId}`}>Paid via</Label>
                        <Input
                          id={`m-${o.providerId}`}
                          placeholder="Zelle, Check, ACH…"
                          value={method[o.providerId] ?? ""}
                          onChange={(e) =>
                            setMethod((s) => ({
                              ...s,
                              [o.providerId]: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor={`n-${o.providerId}`}>Note (optional)</Label>
                        <Input
                          id={`n-${o.providerId}`}
                          placeholder="Reference / memo"
                          value={note[o.providerId] ?? ""}
                          onChange={(e) =>
                            setNote((s) => ({
                              ...s,
                              [o.providerId]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        disabled={payingId === o.providerId}
                        onClick={() => pay(o)}
                      >
                        {payingId === o.providerId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Mark paid
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Payout history</h2>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No payouts yet.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{h.providerName}</p>
                      <p className="text-[var(--muted-foreground)]">
                        {formatDate(h.createdAt)} · {h.visitCount} visit
                        {h.visitCount > 1 ? "s" : ""} · {h.method}
                        {h.note ? ` · ${h.note}` : ""}
                      </p>
                    </div>
                    <span className="font-medium text-[var(--primary)]">
                      {formatCurrency(h.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
