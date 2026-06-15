"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { ServiceType } from "@/lib/types";

interface SvcRow {
  id: ServiceType;
  name: string;
  durationMinutes: number;
  defaultPriceCents: number;
  enabled: boolean;
}

export default function AdminServicesPage() {
  const toast = useToast();
  const [rows, setRows] = React.useState<SvcRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [livePrice, setLivePrice] = React.useState("");
  const [savingLive, setSavingLive] = React.useState(false);

  const load = React.useCallback(() => {
    authedFetch("/api/admin/services")
      .then((r) => r.json())
      .then((d) =>
        setRows(
          (d.services ?? []).map((s: SvcRow) => ({
            ...s,
            price: (s.defaultPriceCents / 100).toFixed(0),
          })),
        ),
      )
      .finally(() => setLoading(false));
    authedFetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) =>
        setLivePrice(((d.realtimePriceCents ?? 7500) / 100).toFixed(0)),
      )
      .catch(() => {});
  }, []);

  React.useEffect(() => load(), [load]);

  async function saveLivePrice() {
    setSavingLive(true);
    try {
      const dollars = Number(livePrice);
      const res = await authedFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ realtimePriceCents: Math.round(dollars * 100) }),
      });
      if (!res.ok) throw new Error();
      toast.success("Real-time price updated");
    } catch {
      toast.error("Couldn't update real-time price");
    } finally {
      setSavingLive(false);
    }
  }

  function update(id: string, patch: Partial<SvcRow & { price: string }>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(row: SvcRow & { price?: string }) {
    setSavingId(row.id);
    try {
      const dollars = Number(row.price ?? row.defaultPriceCents / 100);
      const res = await authedFetch("/api/admin/services", {
        method: "PUT",
        body: JSON.stringify({
          id: row.id,
          enabled: row.enabled,
          defaultPriceCents: Math.round(dollars * 100),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${row.name} updated`);
      load();
    } catch {
      toast.error("Couldn't update service");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="text-[var(--muted-foreground)]">
          Enable/disable services and set the platform default price.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Real-Time (No-Wait) visit price</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Flat premium price for on-demand visits, charged regardless of
              condition.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">
                $
              </span>
              <Input
                inputMode="numeric"
                className="pl-6"
                value={livePrice}
                onChange={(e) =>
                  setLivePrice(e.target.value.replace(/[^0-9]/g, ""))
                }
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={savingLive}
              onClick={saveLivePrice}
            >
              {savingLive ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Scheduled visit prices</h2>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        ) : (
          <div className="space-y-3">
            {rows.map((row: SvcRow & { price?: string }) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4"
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={row.enabled}
                    onCheckedChange={(v) => update(row.id, { enabled: v })}
                  />
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {row.durationMinutes} min ·{" "}
                      {row.enabled ? "Bookable" : "Hidden"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-24">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">
                      $
                    </span>
                    <Input
                      inputMode="numeric"
                      className="pl-6"
                      value={row.price ?? ""}
                      onChange={(e) =>
                        update(row.id, {
                          price: e.target.value.replace(/[^0-9]/g, ""),
                        })
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingId === row.id}
                    onClick={() => save(row)}
                  >
                    {savingId === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
