"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { formatDate } from "@/lib/datetime";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

type PayoutMode = "stripe" | "manual";

interface Outstanding {
  providerId: string;
  providerName: string;
  amountCents: number;
  visitCount: number;
  payoutMode: PayoutMode;
}
interface AutoPaid {
  providerId: string;
  providerName: string;
  amountCents: number;
  visitCount: number;
}
interface ProviderMode {
  providerId: string;
  providerName: string;
  payoutMode: PayoutMode;
  stripeAccountId: string | null;
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
  const [autoPaid, setAutoPaid] = React.useState<AutoPaid[]>([]);
  const [providers, setProviders] = React.useState<ProviderMode[]>([]);
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
        setAutoPaid(d.autoPaid ?? []);
        setProviders(d.providers ?? []);
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
  const totalAuto = autoPaid.reduce((s, o) => s + o.amountCents, 0);
  const stripeCount = providers.filter((p) => p.payoutMode === "stripe").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Provider payouts</h1>
        <p className="text-[var(--muted-foreground)]">
          Nurses on <strong>Auto (Stripe)</strong> get their share split off
          automatically and Stripe deposits it to their bank every Friday —
          nothing to do here. Nurses on <strong>Manual</strong> (including
          you) are paid by hand (Zelle, check, ACH); record it below to send
          them a confirmation.
        </p>
      </div>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      ) : (
        <>
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Payout method by nurse</h2>
              <span className="text-sm text-[var(--muted-foreground)]">
                {stripeCount} of {providers.length} on Stripe
              </span>
            </div>
            {providers.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No approved nurses yet.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {providers.map((p) => (
                  <li
                    key={p.providerId}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <span className="font-medium">{p.providerName}</span>
                    <PayoutModeBadge mode={p.payoutMode} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Outstanding (manual)</h2>
              <span className="text-sm text-[var(--muted-foreground)]">
                Total owed:{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {formatCurrency(totalOwed)}
                </span>
              </span>
            </div>
            {outstanding.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                Nothing outstanding — all manual payouts are up to date.
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
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {o.providerName}
                          <PayoutModeBadge mode={o.payoutMode} />
                        </p>
                        <p className="text-sm text-[var(--muted-foreground)]">
                          {o.visitCount} visit{o.visitCount > 1 ? "s" : ""} awaiting
                          manual payout
                          {o.payoutMode === "stripe"
                            ? " (completed before Stripe was set up)"
                            : ""}
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

          {autoPaid.length > 0 && (
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Split automatically via Stripe</h2>
                <span className="text-sm text-[var(--muted-foreground)]">
                  Total:{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    {formatCurrency(totalAuto)}
                  </span>
                </span>
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {autoPaid.map((a) => (
                  <li
                    key={a.providerId}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{a.providerName}</p>
                      <p className="text-[var(--muted-foreground)]">
                        {a.visitCount} visit{a.visitCount > 1 ? "s" : ""} · paid
                        out by Stripe every Friday
                      </p>
                    </div>
                    <span className="font-medium text-[var(--primary)]">
                      {formatCurrency(a.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Manual payout history</h2>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No manual payouts yet.
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

function PayoutModeBadge({ mode }: { mode: PayoutMode }) {
  return mode === "stripe" ? (
    <Badge variant="success">Auto (Stripe)</Badge>
  ) : (
    <Badge variant="warning">Manual</Badge>
  );
}
