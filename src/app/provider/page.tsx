"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Pencil,
  Star,
  Video,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  useProviderAppointments,
  useProviderAvailability,
  useProviderProfile,
} from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { WEEKDAYS, formatDateTime, isToday } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WaitingBadge } from "@/components/visit/waiting-badge";
import { GoLiveToggle } from "@/components/live/go-live-toggle";
import { LiveBadge } from "@/components/live/live-badge";
import { QueueStrip } from "@/components/live/queue-strip";
import { holdPresenceForVisit } from "@/components/live/presence-context";
import { PayoutSetupCard } from "@/components/provider/payout-setup-card";
import type { Appointment } from "@/lib/types";

export default function ProviderOverview() {
  const { user, profile } = useAuth();
  const { profile: provider } = useProviderProfile(user?.uid);
  const { appointments, loading } = useProviderAppointments(user?.uid);
  const { availability } = useProviderAvailability(user?.uid);

  const now = Date.now();
  const today = appointments.filter(
    (a) => isToday(a.start) && a.status !== "cancelled",
  );
  // Upcoming excludes today's visits so it never double-counts with "today".
  const upcoming = appointments.filter(
    (a) => a.start > now && a.status === "booked" && !isToday(a.start),
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {firstName}
          </h1>
          <p className="text-[var(--muted-foreground)]">
            Here&apos;s what&apos;s happening with your practice today.
          </p>
        </div>
        {provider && provider.ratingCount ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-right">
            <span className="flex items-center gap-1.5 text-lg font-semibold">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              {(provider.ratingAvg ?? 0).toFixed(1)}
            </span>
            <p className="text-xs text-[var(--muted-foreground)]">
              {provider.ratingCount} rating{provider.ratingCount > 1 ? "s" : ""}
            </p>
          </div>
        ) : null}
      </div>

      <QueueStrip />

      <GoLiveToggle />

      {provider?.status === "approved" && <PayoutSetupCard compact />}

      <ScheduleCard availability={availability} />

      {provider?.status === "pending" && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">
                Your application is under review
              </p>
              <p className="text-sm text-amber-700">
                You&apos;ll be able to accept patients once an ARSkinRX admin
                approves your credentials. Your schedule and profile are ready
                to go — you can adjust them any time.
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

function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")} ${suffix}` : `${hr} ${suffix}`;
}

/** Compact weekly-hours summary with a one-tap path to change it. */
function ScheduleCard({
  availability,
}: {
  availability: ReturnType<typeof useProviderAvailability>["availability"];
}) {
  const windows = availability?.windows ?? [];
  const byDay = WEEKDAYS.map((day, i) => ({
    day,
    slots: windows
      .filter((w) => w.weekday === i)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((d) => d.slots.length > 0);
  const blackouts = availability?.blackoutDates?.length ?? 0;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Your weekly hours</h2>
        <Link href="/provider/availability">
          <Button size="sm" variant="outline">
            <Pencil className="h-4 w-4" /> Edit schedule
          </Button>
        </Link>
      </div>
      {byDay.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No hours set yet — patients can&apos;t book you until you add some.
        </p>
      ) : (
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {byDay.map((d) => (
            <li key={d.day} className="flex justify-between gap-3">
              <span className="font-medium">{d.day.slice(0, 3)}</span>
              <span className="text-right text-[var(--muted-foreground)]">
                {d.slots.map((s) => `${fmt12(s.startTime)}–${fmt12(s.endTime)}`).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {blackouts > 0 && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          {blackouts} day{blackouts === 1 ? "" : "s"} off scheduled.
        </p>
      )}
    </Card>
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
        <p className="flex items-center gap-2 truncate font-medium hover:text-[var(--primary)]">
          {service?.name ?? appt.serviceId}
          {appt.isLive && <LiveBadge />}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {formatDateTime(appt.start)}
        </p>
      </Link>
      <div className="flex items-center gap-3">
        <StatusBadge appt={appt} />
        {joinable && appt.status !== "completed" && (
          <>
            <WaitingBadge appointmentId={appt.id} peer="client" />
            <Link href={`/visit/${appt.id}`} onClick={holdPresenceForVisit}>
              <Button size="sm">
                <Video className="h-4 w-4" /> Enter room
              </Button>
            </Link>
          </>
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
