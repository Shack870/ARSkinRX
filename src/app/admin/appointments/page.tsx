"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Loader2, Search } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { SERVICE_MAP } from "@/lib/services";
import { formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveBadge } from "@/components/live/live-badge";
import type { AppointmentStatus, ServiceType } from "@/lib/types";

const STATUS_OPTIONS: (AppointmentStatus | "all")[] = [
  "all",
  "booked",
  "completed",
  "no_show",
  "cancelled",
  "pending_payment",
];

interface AdminAppt {
  id: string;
  serviceId: ServiceType;
  start: number;
  status: AppointmentStatus;
  priceCents: number;
  isLive: boolean;
  clientName: string;
  providerName: string;
}

const VARIANT: Record<string, "primary" | "success" | "danger" | "warning" | "default"> =
  {
    pending_payment: "warning",
    booked: "primary",
    in_progress: "success",
    completed: "success",
    no_show: "danger",
    rescheduled: "default",
    cancelled: "default",
  };

export default function AdminAppointmentsPage() {
  const [appts, setAppts] = React.useState<AdminAppt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<AppointmentStatus | "all">("all");

  React.useEffect(() => {
    authedFetch("/api/admin/appointments")
      .then((r) => r.json())
      .then((d) => setAppts(d.appointments ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = appts.filter((a) => {
    if (status !== "all" && a.status !== status) return false;
    const s = q.toLowerCase();
    return (
      !s ||
      a.clientName.toLowerCase().includes(s) ||
      a.providerName.toLowerCase().includes(s) ||
      (SERVICE_MAP[a.serviceId]?.name ?? "").toLowerCase().includes(s)
    );
  });

  function exportCsv() {
    downloadCsv(
      "arskinrx-appointments.csv",
      filtered.map((a) => ({
        date: formatDateTime(a.start),
        service: SERVICE_MAP[a.serviceId]?.name ?? a.serviceId,
        type: a.isLive ? "live" : "scheduled",
        patient: a.clientName,
        provider: a.providerName,
        price: (a.priceCents / 100).toFixed(2),
        status: a.status,
      })),
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            placeholder="Search patient, provider, service"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AppointmentStatus | "all")}
          className="h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-6">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {appts.length === 0 ? "No appointments yet." : "No matches."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3">Patient</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--muted)]"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Link
                        href={`/admin/appointments/${a.id}`}
                        className="hover:text-[var(--primary)]"
                      >
                        {formatDateTime(a.start)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-2">
                        {SERVICE_MAP[a.serviceId]?.name ?? a.serviceId}
                        {a.isLive && <LiveBadge />}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{a.clientName}</td>
                    <td className="py-2 pr-3">{a.providerName}</td>
                    <td className="py-2 pr-3">{formatCurrency(a.priceCents)}</td>
                    <td className="py-2">
                      <Badge variant={VARIANT[a.status]}>
                        {a.status.replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
