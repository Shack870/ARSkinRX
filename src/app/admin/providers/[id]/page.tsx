"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { SERVICE_MAP } from "@/lib/services";
import { formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ServiceType } from "@/lib/types";

interface Detail {
  provider: {
    uid: string;
    displayName: string;
    email: string;
    phone: string;
    licenseNumber: string;
    conditions: ServiceType[];
    status: string;
    bio: string;
  };
  earnings: { completedCount: number; paidOutCents: number; pendingCents: number };
  appointments: {
    id: string;
    serviceId: ServiceType;
    start: number;
    status: string;
    priceCents: number;
  }[];
}

export default function AdminProviderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    authedFetch(`/api/admin/providers/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="text-[var(--muted-foreground)]">Provider not found.</p>
        <Link href="/admin/providers" className="mt-4 inline-block">
          <Button variant="outline">Back</Button>
        </Link>
      </div>
    );
  }

  const { provider, earnings, appointments } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/providers"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Providers
      </Link>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {provider.displayName}
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {provider.email}
              {provider.phone ? ` · ${provider.phone}` : ""}
            </p>
          </div>
          <Badge
            variant={
              provider.status === "approved"
                ? "success"
                : provider.status === "suspended"
                  ? "danger"
                  : "warning"
            }
          >
            {provider.status}
          </Badge>
        </div>
        {provider.bio && (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            {provider.bio}
          </p>
        )}
        <dl className="mt-4 border-t border-[var(--border)] pt-4 text-xs">
          <Cred label="Arkansas license" value={provider.licenseNumber} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-1">
          {provider.conditions.map((c) => (
            <Badge key={c}>{SERVICE_MAP[c]?.name ?? c}</Badge>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Completed" value={String(earnings.completedCount)} />
        <StatCard label="Paid out" value={formatCurrency(earnings.paidOutCents)} />
        <StatCard label="Pending" value={formatCurrency(earnings.pendingCents)} />
      </div>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Recent visits</h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No visits yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <Link
                  href={`/admin/appointments/${a.id}`}
                  className="hover:text-[var(--primary)]"
                >
                  {SERVICE_MAP[a.serviceId]?.name ?? a.serviceId} ·{" "}
                  {formatDateTime(a.start)}
                </Link>
                <Badge
                  variant={a.status === "completed" ? "success" : "default"}
                >
                  {a.status.replace("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
    </Card>
  );
}
