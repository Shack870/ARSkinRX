"use client";

import Link from "next/link";
import { CalendarHeart, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useClientAppointments } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDateTime } from "@/lib/datetime";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Appointment, AppointmentStatus } from "@/lib/types";

const STATUS_VARIANT: Record<
  AppointmentStatus,
  "primary" | "success" | "danger" | "warning" | "default"
> = {
  pending_payment: "warning",
  booked: "primary",
  in_progress: "success",
  completed: "success",
  no_show: "danger",
  rescheduled: "default",
  cancelled: "default",
};

export default function AppointmentsListPage() {
  const { user } = useAuth();
  const { appointments, loading } = useClientAppointments(user?.uid);
  const sorted = [...appointments].reverse();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">My visits</h1>
      <Card className="p-6">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : sorted.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-10 text-center">
            <CalendarHeart className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              You have no visits yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {sorted.map((a: Appointment) => (
              <li key={a.id}>
                <Link
                  href={`/dashboard/appointments/${a.id}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {SERVICE_MAP[a.serviceId]?.name ?? a.serviceId}
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {formatDateTime(a.start)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[a.status]}>
                      {a.status.replace("_", " ")}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
