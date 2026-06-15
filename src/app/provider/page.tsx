"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Video,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  useProviderAppointments,
  useProviderProfile,
} from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDateTime, isToday } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GoLiveToggle } from "@/components/live/go-live-toggle";
import type { Appointment } from "@/lib/types";

export default function ProviderOverview() {
  const { user, profile } = useAuth();
  const { profile: provider } = useProviderProfile(user?.uid);
  const { appointments, loading } = useProviderAppointments(user?.uid);

  const now = Date.now();
  const today = appointments.filter(
    (a) => isToday(a.start) && a.status !== "cancelled",
  );
  const upcoming = appointments.filter(
    (a) => a.start > now && a.status === "booked",
  );
  const completedThisMonth = appointments.filter((a) => {
    const d = new Date(a.start);
    const n = new Date();
    return (
      a.status === "completed" &&
      d.getMonth() === n.getMonth() &&
      d.getFullYear() === n.getFullYear()
    );
  });
  const monthEarnings = completedThisMonth.reduce(
    (sum, a) => sum + (a.priceCents - a.platformFeeCents),
    0,
  );

  const firstName = (profile?.displayName ?? "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {firstName}
        </h1>
        <p className="text-[var(--muted-foreground)]">
          Here&apos;s what&apos;s happening with your practice today.
        </p>
      </div>

      <GoLiveToggle />

      {provider?.status === "pending" && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">
                Your application is under review
              </p>
              <p className="text-sm text-amber-700">
                You&apos;ll be able to set availability and accept patients once
                an ARSkinRX admin approves your credentials. You can finish
                setting up your profile and availability in the meantime.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          icon={CalendarClock}
          tint="tint-teal"
          label="Today's visits"
          value={String(today.length)}
        />
        <Stat
          icon={Video}
          tint="tint-sky"
          label="Upcoming"
          value={String(upcoming.length)}
        />
        <Stat
          icon={CheckCircle2}
          tint="tint-emerald"
          label="Completed (mo.)"
          value={String(completedThisMonth.length)}
        />
        <Stat
          icon={Wallet}
          tint="tint-amber"
          label="Earnings (mo.)"
          value={formatCurrency(monthEarnings)}
        />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Today&apos;s schedule</h2>
          <Link
            href="/provider/schedule"
            className="text-sm text-[var(--primary)] hover:underline"
          >
            View all
          </Link>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            Loading…
          </p>
        ) : today.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-10 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              No visits scheduled today.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {today.map((a) => (
              <AppointmentRow key={a.id} appt={a} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tint = "tint-teal",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <Card className="p-4">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] ${tint}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
    </Card>
  );
}

function AppointmentRow({ appt }: { appt: Appointment }) {
  const service = SERVICE_MAP[appt.serviceId];
  const now = Date.now();
  const joinable = now >= appt.start - 5 * 60 * 1000 && now <= appt.end;
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <Link href={`/provider/appointments/${appt.id}`} className="min-w-0 flex-1">
        <p className="truncate font-medium hover:text-[var(--primary)]">
          {service?.name ?? appt.serviceId}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {formatDateTime(appt.start)}
        </p>
      </Link>
      <div className="flex items-center gap-3">
        <StatusBadge appt={appt} />
        {joinable && appt.status !== "completed" && (
          <Link href={`/visit/${appt.id}`}>
            <Button size="sm">
              <Video className="h-4 w-4" /> Join
            </Button>
          </Link>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ appt }: { appt: Appointment }) {
  switch (appt.status) {
    case "booked":
      return <Badge variant="primary">Booked</Badge>;
    case "in_progress":
      return <Badge variant="success">In progress</Badge>;
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "no_show":
      return <Badge variant="danger">No-show</Badge>;
    default:
      return <Badge>{appt.status}</Badge>;
  }
}
