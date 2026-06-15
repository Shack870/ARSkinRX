"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  useAppointment,
  useIntake,
  useUserProfile,
  useVisitNote,
} from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IntakeSummary } from "@/components/intake-summary";
import { IntakePhotos } from "@/components/intake-photos";
import { LiveBadge } from "@/components/live/live-badge";

export default function AdminAppointmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { appointment, loading } = useAppointment(id);
  const { profile: client } = useUserProfile(appointment?.clientId);
  const { profile: provider } = useUserProfile(appointment?.providerId);
  const { intake } = useIntake(appointment?.intakeId);
  const { note } = useVisitNote(id);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }
  if (!appointment) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="text-[var(--muted-foreground)]">Appointment not found.</p>
        <Link href="/admin/appointments" className="mt-4 inline-block">
          <Button variant="outline">Back</Button>
        </Link>
      </div>
    );
  }

  const service = SERVICE_MAP[appointment.serviceId];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/appointments"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Appointments
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {service?.name}
            </h1>
            <p className="text-[var(--muted-foreground)]">
              {formatDateTime(appointment.start)} ·{" "}
              {formatCurrency(appointment.priceCents)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {appointment.isLive && <LiveBadge />}
            <Badge variant={appointment.status === "completed" ? "success" : "primary"}>
              {appointment.status.replace("_", " ")}
            </Badge>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
          <Party label="Patient" name={client?.displayName} email={client?.email} phone={client?.phone} />
          <Party label="Provider" name={provider?.displayName} email={provider?.email} phone={provider?.phone} />
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Intake</h2>
        <IntakeSummary intake={intake} />
        <IntakePhotos paths={intake?.photoPaths ?? []} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Visit notes</h2>
        {note ? (
          <dl className="space-y-3">
            <Block label="Subjective" value={note.subjective} />
            <Block label="Assessment" value={note.assessment} />
            <Block label="Plan" value={note.plan} />
            <Block label="Prescribed" value={note.prescribed} />
          </dl>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            No notes recorded.
          </p>
        )}
      </Card>
    </div>
  );
}

function Party({
  label,
  name,
  email,
  phone,
}: {
  label: string;
  name?: string;
  email?: string;
  phone?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{name || "—"}</dd>
      <dd className="text-sm text-[var(--muted-foreground)]">{email}</dd>
      {phone && <dd className="text-sm text-[var(--muted-foreground)]">{phone}</dd>}
    </div>
  );
}

function Block({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
