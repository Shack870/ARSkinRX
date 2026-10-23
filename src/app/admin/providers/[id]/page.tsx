"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { SERVICE_MAP } from "@/lib/services";
import { formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { WeekCalendar } from "@/components/week-calendar";
import type { AvailabilityWindow, ServiceType } from "@/lib/types";

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
  counts: { total: number; upcoming: number };
  availability: {
    timezone: string;
    windows: AvailabilityWindow[];
    blackoutDates: string[];
  } | null;
  calendar: {
    id: string;
    serviceId: ServiceType;
    start: number;
    end: number;
    status: string;
    isLive: boolean;
    clientName: string;
  }[];
  earnings: {
    completedCount: number;
    liveCount: number;
    noShow: number;
    cancelled: number;
    noShowRate: number;
    grossCents: number;
    platformCents: number;
    paidOutCents: number;
    pendingCents: number;
  };
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
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState(false);
  const [tab, setTab] = React.useState<"calendar" | "recent">("calendar");

  const load = React.useCallback(() => {
    return authedFetch(`/api/admin/providers/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function act(action: "approve" | "suspend" | "reinstate") {
    const copy = {
      approve: {
        title: "Approve this nurse?",
        message: "They'll appear to patients immediately and can start taking visits.",
        confirmLabel: "Approve",
      },
      suspend: {
        title: "Suspend this nurse?",
        message: "They'll be hidden from booking and can't take new visits. Existing bookings are unaffected.",
        confirmLabel: "Suspend",
      },
      reinstate: {
        title: "Reinstate this nurse?",
        message: "They'll be visible to patients again.",
        confirmLabel: "Reinstate",
      },
    }[action];
    const ok = await confirm({ ...copy, destructive: action === "suspend" });
    if (!ok) return;
    setActing(true);
    try {
      const res = await authedFetch(`/api/admin/providers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        action === "approve"
          ? "Nurse approved"
          : action === "suspend"
            ? "Nurse suspended"
            : "Nurse reinstated",
      );
      await load();
    } catch {
      toast.error("Couldn't update status", "Please try again.");
    } finally {
      setActing(false);
    }
  }

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

  const { provider, earnings, appointments, counts, availability, calendar } = data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/admin/providers"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Providers
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {provider.displayName}
              </h1>
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
            <p className="text-sm text-[var(--muted-foreground)]">
              {provider.email}
              {provider.phone ? ` · ${provider.phone}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {provider.status === "pending" && (
              <Button size="sm" onClick={() => act("approve")} disabled={acting}>
                Approve
              </Button>
            )}
            {provider.status === "approved" && (
              <>
                <Link href={`/admin/appointments/new?provider=${provider.uid}`}>
                  <Button size="sm">
                    <CalendarPlus className="h-4 w-4" /> Book a visit
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => act("suspend")}
                  disabled={acting}
                >
                  Suspend
                </Button>
              </>
            )}
            {provider.status === "suspended" && (
              <Button size="sm" onClick={() => act("reinstate")} disabled={acting}>
                Reinstate
              </Button>
            )}
          </div>
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total appointments" value={String(counts.total)} />
        <StatCard label="Upcoming" value={String(counts.upcoming)} />
        <StatCard label="Completed visits" value={String(earnings.completedCount)} />
        <StatCard label="Live visits" value={String(earnings.liveCount)} />
        <StatCard
          label="No-shows"
          value={`${earnings.noShow} (${Math.round(earnings.noShowRate * 100)}%)`}
        />
        <StatCard label="Gross generated" value={formatCurrency(earnings.grossCents)} />
        <StatCard label="Platform cut (50%)" value={formatCurrency(earnings.platformCents)} />
        <StatCard
          label="Nurse earnings"
          value={formatCurrency(earnings.paidOutCents + earnings.pendingCents)}
        />
        <StatCard label="Paid out" value={formatCurrency(earnings.paidOutCents)} />
        <StatCard label="Pending payout" value={formatCurrency(earnings.pendingCents)} />
        <StatCard label="Cancelled" value={String(earnings.cancelled)} />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setTab("calendar")}
              className={`rounded-[6px] px-3 py-1.5 ${tab === "calendar" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"}`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setTab("recent")}
              className={`rounded-[6px] px-3 py-1.5 ${tab === "recent" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"}`}
            >
              Recent visits
            </button>
          </div>
          {availability && (
            <span className="text-xs text-[var(--muted-foreground)]">
              Hours shown in {availability.timezone.replace("_", " ")}
            </span>
          )}
        </div>

        {tab === "calendar" ? (
          <WeekCalendar
            events={calendar.map((a) => ({
              id: a.id,
              start: a.start,
              end: a.end,
              title: a.clientName,
              subtitle: `${SERVICE_MAP[a.serviceId]?.name ?? a.serviceId}${a.isLive ? " (live)" : ""}`,
              status: a.status,
              href: `/admin/appointments/${a.id}`,
            }))}
            windows={availability?.windows ?? []}
            timezone={availability?.timezone}
            blackoutDates={availability?.blackoutDates ?? []}
          />
        ) : appointments.length === 0 ? (
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
