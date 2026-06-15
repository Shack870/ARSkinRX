"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { SERVICE_MAP } from "@/lib/services";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProviderStatus, ServiceType } from "@/lib/types";

interface AdminProvider {
  uid: string;
  displayName: string;
  email: string;
  licenseNumber: string;
  conditions: ServiceType[];
  status: ProviderStatus;
  stripeOnboardingComplete: boolean;
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = React.useState<AdminProvider[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    authedFetch("/api/admin/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => load(), [load]);

  async function act(uid: string, action: string) {
    setBusy(uid);
    try {
      await authedFetch(`/api/admin/providers/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  const pending = providers.filter((p) => p.status === "pending");
  const others = providers.filter((p) => p.status !== "pending");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>

      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      ) : (
        <>
          {pending.length > 0 && (
            <Card className="p-6">
              <h2 className="mb-4 font-semibold">Awaiting approval</h2>
              <div className="space-y-4">
                {pending.map((p) => (
                  <ProviderRow
                    key={p.uid}
                    p={p}
                    busy={busy === p.uid}
                    onAct={act}
                  />
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="mb-4 font-semibold">All providers</h2>
            {others.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No approved providers yet.
              </p>
            ) : (
              <div className="space-y-4">
                {others.map((p) => (
                  <ProviderRow
                    key={p.uid}
                    p={p}
                    busy={busy === p.uid}
                    onAct={act}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ProviderRow({
  p,
  busy,
  onAct,
}: {
  p: AdminProvider;
  busy: boolean;
  onAct: (uid: string, action: string) => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/admin/providers/${p.uid}`}
            className="font-medium hover:text-[var(--primary)]"
          >
            {p.displayName}
          </Link>
          <p className="text-sm text-[var(--muted-foreground)]">{p.email}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {p.conditions.map((c) => (
              <Badge key={c}>{SERVICE_MAP[c]?.name ?? c}</Badge>
            ))}
          </div>
        </div>
        <StatusBadge status={p.status} />
      </div>
      <dl className="mt-3 text-xs">
        <Cred label="Arkansas license" value={p.licenseNumber} />
      </dl>
      <div className="mt-4 flex gap-2">
        {p.status === "pending" && (
          <Button size="sm" disabled={busy} onClick={() => onAct(p.uid, "approve")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Approve
          </Button>
        )}
        {p.status === "approved" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAct(p.uid, "suspend")}
          >
            Suspend
          </Button>
        )}
        {p.status === "suspended" && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onAct(p.uid, "reinstate")}
          >
            Reinstate
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  const map = {
    pending: { v: "warning" as const, l: "Pending" },
    approved: { v: "success" as const, l: "Approved" },
    suspended: { v: "danger" as const, l: "Suspended" },
  };
  const { v, l } = map[status];
  return <Badge variant={v}>{l}</Badge>;
}

function Cred({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
