"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { SERVICE_MAP } from "@/lib/services";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ServiceType } from "@/lib/types";

interface Detail {
  patient: {
    uid: string;
    displayName: string;
    email: string;
    phone: string;
    createdAt: number;
  };
  totalPaidCents: number;
  paymentCount: number;
  appointments: {
    id: string;
    serviceId: ServiceType;
    start: number;
    status: string;
    priceCents: number;
  }[];
}

export default function AdminPatientDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    authedFetch(`/api/admin/patients/${id}`)
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
        <p className="text-[var(--muted-foreground)]">Patient not found.</p>
        <Link href="/admin/patients" className="mt-4 inline-block">
          <Button variant="outline">Back</Button>
        </Link>
      </div>
    );
  }

  const { patient, totalPaidCents, paymentCount, appointments } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/patients"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Patients
      </Link>

      <Card className="p-6">
        <h1 className="text-xl font-semibold tracking-tight">
          {patient.displayName}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {patient.email}
          {patient.phone ? ` · ${patient.phone}` : ""}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Joined {formatDate(patient.createdAt)}
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Visits" value={String(appointments.length)} />
        <StatCard label="Payments" value={String(paymentCount)} />
        <StatCard label="Total paid" value={formatCurrency(totalPaidCents)} />
      </div>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Visit history</h2>
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
                <Badge variant={a.status === "completed" ? "success" : "default"}>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
    </Card>
  );
}
