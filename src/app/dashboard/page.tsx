"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Video,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useClientAppointments } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDateTime, formatCountdown, formatRelativeDay, formatTime } from "@/lib/datetime";
import { isJoinable, needsReschedule, JOIN_EARLY_MS } from "@/lib/appointment-window";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import type { Appointment } from "@/lib/types";

export default function ClientOverview() {
  const { user, profile } = useAuth();
  const { appointments, loading } = useClientAppointments(user?.uid);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const reschedules = appointments.filter(needsReschedule);
  const upcoming = appointments.filter(
    (a) => a.end >= now && ["booked", "in_progress", "pending_payment"].includes(a.status),
  );
  const nextVisit = upcoming.find((a) => a.status === "booked" || a.status === "in_progress");
  const restUpcoming = upcoming.filter((a) => a.id !== nextVisit?.id);

  const firstName = (profile?.displayName ?? "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi {firstName}
          </h1>
          <p className="text-[var(--muted-foreground)]">Your care at a glance.</p>
        </div>
        <Link href="/book">
          <Button>
            <CalendarPlus className="h-4 w-4" /> Book a visit
          </Button>
        </Link>
      </div>

      <VerifyEmailBanner />

      {reschedules.map((a) => (
        <Card key={a.id} className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">
                  You missed your {SERVICE_MAP[a.serviceId]?.name} visit
                </p>
                <p className="text-sm text-amber-700">
                  No worries — you can reschedule once for free.
                </p>
              </div>
            </div>
            <Link href={`/dashboard/appointments/${a.id}`}>
              <Button size="sm">Reschedule</Button>
            </Link>
          </div>
        </Card>
      ))}

      {loading ? (
        <Card className="p-6">
          <SkeletonRows rows={3} />
        </Card>
      ) : (
        <>
          {nextVisit && <NextVisitHero appt={nextVisit} now={now} />}

          <Card className="p-6">
            <h2 className="mb-4 font-semibold">
              {nextVisit ? "More upcoming visits" : "Upcoming visits"}
            </h2>
            {restUpcoming.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-10 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">
                  {nextVisit ? "Nothing else scheduled." : "No upcoming visits."}
                </p>
                <Link href="/book" className="mt-3 inline-block">
                  <Button size="sm" variant="soft">
                    {nextVisit ? "Book another visit" : "Book your first visit"}
                  </Button>
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {restUpcoming.map((a) => (
                  <ClientApptRow key={a.id} appt={a} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const PREP_TIPS = [
  "Find a quiet, well-lit spot",
  "Have your questions ready",
  "Test your camera & mic",
];

function NextVisitHero({ appt, now }: { appt: Appointment; now: number }) {
  const service = SERVICE_MAP[appt.serviceId];
  const joinable = isJoinable(appt, now);
  const untilJoin = appt.start - JOIN_EARLY_MS - now;

  return (
    <Card className="overflow-hidden border-[var(--primary)]">
      <div className="bg-gradient-to-br from-[var(--primary)] to-[#27514d] p-6 text-[var(--primary-foreground)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-soft)]">
          Your next visit
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {service?.name}
            </h2>
            <p className="text-[var(--primary-soft)]">
              {formatRelativeDay(appt.start)} at {formatTime(appt.start)}
            </p>
          </div>
          {joinable ? (
            <Link href={`/visit/${appt.id}`}>
              <Button variant="accent" size="lg">
                <Video className="h-4 w-4" /> Join now
              </Button>
            </Link>
          ) : (
            <div className="text-right">
              <p className="text-xs text-[var(--primary-soft)]">Join opens in</p>
              <p className="font-mono text-xl font-semibold">
                {formatCountdown(untilJoin)}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 p-4">
        {PREP_TIPS.map((tip) => (
          <span
            key={tip}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]"
          >
            <CheckCircle2 className="h-4 w-4 text-[var(--primary)]" /> {tip}
          </span>
        ))}
      </div>
    </Card>
  );
}

function ClientApptRow({ appt }: { appt: Appointment }) {
  const joinable = isJoinable(appt);
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <Link href={`/dashboard/appointments/${appt.id}`} className="min-w-0">
        <p className="truncate font-medium">
          {SERVICE_MAP[appt.serviceId]?.name ?? appt.serviceId}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {formatDateTime(appt.start)}
        </p>
      </Link>
      <div className="flex items-center gap-3">
        {appt.status === "pending_payment" ? (
          <Badge variant="warning">Payment pending</Badge>
        ) : (
          <Badge variant="primary">Booked</Badge>
        )}
        {joinable && (
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
