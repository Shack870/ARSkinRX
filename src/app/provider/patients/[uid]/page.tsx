"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cake,
  ClipboardList,
  Mail,
  Phone,
  Stethoscope,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/api-client";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import type {
  AppointmentStatus,
  IntakeResponse,
  ProviderPatientDetail,
  ProviderPatientVisit,
  VisitNote,
} from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IntakeSummary } from "@/components/intake-summary";
import { IntakePhotos } from "@/components/intake-photos";
import { LiveBadge } from "@/components/live/live-badge";
import { SoapNoteEditor } from "../_components/soap-note-editor";
import { formatDob } from "../_components/format-dob";

const STATUS_VARIANT: Record<
  AppointmentStatus,
  "default" | "primary" | "success" | "warning" | "danger"
> = {
  pending_payment: "default",
  booked: "primary",
  in_progress: "primary",
  completed: "success",
  no_show: "warning",
  rescheduled: "default",
  cancelled: "danger",
};

export default function ProviderPatientDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = use(params);
  const { user } = useAuth();
  const [data, setData] = React.useState<ProviderPatientDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    authedFetch(`/api/provider/patients/${uid}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 404) throw new Error("not_found");
        if (!r.ok) throw new Error(d?.error || "Couldn't load this patient");
        return d as ProviderPatientDetail;
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't load this patient");
      });
    return () => {
      active = false;
    };
  }, [user, uid, reloadKey]);

  const refresh = React.useCallback(() => setReloadKey((k) => k + 1), []);

  const handleSaved = React.useCallback(
    (appointmentId: string, note: VisitNote, amended: boolean) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              visits: prev.visits.map((v) =>
                v.appointment.id === appointmentId ? { ...v, note } : v,
              ),
            }
          : prev,
      );
      // History lives server-side; pull it in after an amendment.
      if (amended) refresh();
    },
    [refresh],
  );

  if (error === "not_found") {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="text-[var(--muted-foreground)]">
          Patient not found, or you haven&apos;t had a visit with them yet.
        </p>
        <Link href="/provider/patients" className="mt-4 inline-block">
          <Button variant="outline">Back to patients</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/provider/patients"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Patients
      </Link>

      {error ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--accent)]">{error}</p>
        </Card>
      ) : !data ? (
        <>
          <Card className="p-6">
            <Skeleton className="h-7 w-48" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
          </Card>
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="mt-2 h-4 w-40" />
              <div className="mt-5 space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </Card>
          ))}
        </>
      ) : (
        <>
          <Card className="p-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              {data.profile.displayName}
            </h1>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <HeaderField
                icon={Cake}
                label="Date of birth"
                value={
                  data.profile.dob
                    ? `${formatDob(data.profile.dob)}${
                        data.profile.age !== null ? ` · ${data.profile.age} yrs` : ""
                      }`
                    : undefined
                }
              />
              <HeaderField icon={Phone} label="Phone" value={data.profile.phone} href={data.profile.phone ? `tel:${data.profile.phone}` : undefined} />
              <HeaderField icon={Mail} label="Email" value={data.profile.email} href={data.profile.email ? `mailto:${data.profile.email}` : undefined} />
              <HeaderField
                icon={Stethoscope}
                label="Visits"
                value={`${data.visits.length} on record`}
              />
            </dl>
          </Card>

          {data.visits.length === 0 ? (
            <Card className="p-6">
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-10 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  No visits on record.
                </p>
              </div>
            </Card>
          ) : (
            <ol className="relative space-y-6 border-l border-[var(--border)] pl-6">
              {data.visits.map((v) => (
                <li key={v.appointment.id} className="relative">
                  <span className="absolute -left-[31px] top-6 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--primary)]" />
                  <VisitCard
                    visit={v}
                    onSaved={(note, amended) =>
                      handleSaved(v.appointment.id, note, amended)
                    }
                  />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function HeaderField({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  href?: string;
}) {
  const text = value || "—";
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </dt>
        <dd className="truncate font-medium">
          {href && value ? (
            <a href={href} className="hover:text-[var(--primary)]">
              {text}
            </a>
          ) : (
            text
          )}
        </dd>
      </div>
    </div>
  );
}

function VisitCard({
  visit,
  onSaved,
}: {
  visit: ProviderPatientVisit;
  onSaved: (note: VisitNote, amended: boolean) => void;
}) {
  const a = visit.appointment;
  const intake: IntakeResponse | null = visit.intake
    ? ({
        id: a.intakeId ?? "",
        appointmentId: a.id,
        clientId: a.clientId,
        serviceId: a.serviceId,
        answers: visit.intake.answers,
        photoPaths: visit.intake.photoPaths,
        createdAt: a.createdAt,
      } as IntakeResponse)
    : null;
  const photoCount = visit.intake?.photoPaths.length ?? 0;
  const hasIntake = Boolean(intake && (Object.keys(intake.answers ?? {}).length || photoCount));

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{visit.serviceName}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            {formatDateTime(a.start)} – {formatTime(a.end)} ·{" "}
            {formatCurrency(a.priceCents)}
            {a.refundedCents ? ` (refunded ${formatCurrency(a.refundedCents)})` : ""}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            with {visit.providerName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {a.isLive && <LiveBadge />}
          <Badge variant={STATUS_VARIANT[a.status] ?? "default"}>
            {a.status.replace("_", " ")}
          </Badge>
          <Link
            href={`/provider/appointments/${a.id}`}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            Open visit
          </Link>
        </div>
      </div>

      <details className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)]">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
          <ClipboardList className="h-4 w-4 text-[var(--muted-foreground)]" />
          Intake
          {photoCount > 0 && (
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              · {photoCount} photo{photoCount === 1 ? "" : "s"}
            </span>
          )}
        </summary>
        <div className="border-t border-[var(--border)] px-3 py-3">
          {hasIntake ? (
            <>
              <IntakeSummary intake={intake} />
              <IntakePhotos paths={intake?.photoPaths ?? []} />
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No intake on file for this visit.
            </p>
          )}
        </div>
      </details>

      <div className="mt-5">
        <h3 className="mb-3 text-sm font-semibold">Visit notes</h3>
        <SoapNoteEditor
          key={visit.note?.updatedAt ?? "new"}
          appointmentId={a.id}
          note={visit.note}
          history={visit.noteHistory}
          canEdit={visit.canEdit}
          onSaved={onSaved}
          compact
        />
      </div>
    </Card>
  );
}
