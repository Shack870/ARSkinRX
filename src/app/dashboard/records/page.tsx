"use client";

import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useClientAppointments, useVisitNote } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDate } from "@/lib/datetime";
import { Card } from "@/components/ui/card";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Appointment } from "@/lib/types";

export default function RecordsPage() {
  const { user } = useAuth();
  const { appointments, loading } = useClientAppointments(user?.uid);
  const completed = [...appointments]
    .filter((a) => a.status === "completed")
    .sort((a, b) => b.start - a.start);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your records</h1>
        <p className="text-[var(--muted-foreground)]">
          A summary of your past visits and care plans.
        </p>
      </div>

      {loading ? (
        <Card className="p-6">
          <SkeletonRows rows={3} />
        </Card>
      ) : completed.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            You don&apos;t have any completed visits yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {completed.map((a) => (
            <RecordCard key={a.id} appt={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordCard({ appt }: { appt: Appointment }) {
  const { note } = useVisitNote(appt.id);
  const service = SERVICE_MAP[appt.serviceId];

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{service?.name ?? appt.serviceId}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            {formatDate(appt.start)}
          </p>
        </div>
        <Link
          href={`/dashboard/appointments/${appt.id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
        >
          Details <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {note && (note.plan || note.prescribed || note.assessment) ? (
        <dl className="mt-4 space-y-3 border-t border-[var(--border)] pt-4 text-sm">
          {note.assessment && <Row label="Assessment" value={note.assessment} />}
          {note.plan && <Row label="Plan" value={note.plan} />}
          {note.prescribed && <Row label="Prescribed" value={note.prescribed} />}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          Visit completed. No written summary was added.
        </p>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
