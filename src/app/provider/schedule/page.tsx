"use client";

import Link from "next/link";
import { CalendarRange, Video } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProviderAppointments } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDateTime } from "@/lib/datetime";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveBadge } from "@/components/live/live-badge";
import type { Appointment } from "@/lib/types";

export default function SchedulePage() {
  const { user } = useAuth();
  const { appointments, loading } = useProviderAppointments(user?.uid);

  const now = Date.now();
  const upcoming = appointments.filter(
    (a) => a.end >= now && a.status !== "cancelled",
  );
  const past = appointments
    .filter((a) => a.end < now || a.status === "completed")
    .reverse();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-[var(--muted-foreground)]">
          All your booked and completed visits.
        </p>
      </div>

      <Section title="Upcoming" appts={upcoming} loading={loading} emptyText="No upcoming visits." />
      <Section title="Past" appts={past} loading={loading} emptyText="No past visits yet." showJoin={false} />
    </div>
  );
}

function Section({
  title,
  appts,
  loading,
  emptyText,
  showJoin = true,
}: {
  title: string;
  appts: Appointment[];
  loading: boolean;
  emptyText: string;
  showJoin?: boolean;
}) {
  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {loading ? (
        <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
          Loading…
        </p>
      ) : appts.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-10 text-center">
          <CalendarRange className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{emptyText}</p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {appts.map((a) => {
            const service = SERVICE_MAP[a.serviceId];
            const joinable =
              Date.now() >= a.start - 5 * 60 * 1000 && Date.now() <= a.end;
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <Link
                  href={`/provider/appointments/${a.id}`}
                  className="min-w-0 flex-1"
                >
                  <p className="flex items-center gap-2 truncate font-medium hover:text-[var(--primary)]">
                    {service?.name ?? a.serviceId}
                    {a.isLive && <LiveBadge />}
                  </p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {formatDateTime(a.start)}
                  </p>
                </Link>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      a.status === "completed"
                        ? "success"
                        : a.status === "no_show"
                          ? "danger"
                          : "primary"
                    }
                  >
                    {a.status}
                  </Badge>
                  {showJoin && joinable && a.status !== "completed" && (
                    <Link href={`/visit/${a.id}`}>
                      <Button size="sm">
                        <Video className="h-4 w-4" /> Join
                      </Button>
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
