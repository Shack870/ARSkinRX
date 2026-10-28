"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, Loader2, User, Video, XCircle } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import {
  useAppointment,
  useIntake,
  useUserProfile,
  useVisitNote,
  useVisitNoteHistory,
} from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import type { ServiceType } from "@/lib/types";
import { isJoinable } from "@/lib/appointment-window";
import { RxStatusCard } from "@/components/rx/rx-status-card";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WaitingBadge } from "@/components/visit/waiting-badge";
import { Badge } from "@/components/ui/badge";
import { IntakeSummary } from "@/components/intake-summary";
import { IntakePhotos } from "@/components/intake-photos";
import { LiveBadge } from "@/components/live/live-badge";
import { SoapNoteEditor } from "@/app/provider/patients/_components/soap-note-editor";

export default function ProviderAppointmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [cancelling, setCancelling] = React.useState(false);
  // Captured once per mount; good enough to decide whether cancel is offered.
  const [now] = React.useState(() => Date.now());
  const { appointment, loading } = useAppointment(id);
  const { profile: patient } = useUserProfile(appointment?.clientId);
  const { intake } = useIntake(appointment?.intakeId);
  const { note, loading: noteLoading } = useVisitNote(id);
  const { history: noteHistory } = useVisitNoteHistory(id);

  const [history, setHistory] = React.useState<{
    pastVisitCount: number;
    visits: { appointmentId: string; serviceId: ServiceType; start: number; providerName: string }[];
  } | null>(null);

  React.useEffect(() => {
    authedFetch(`/api/appointments/${id}/patient-history`)
      .then((r) => r.json())
      .then((d) => setHistory(d))
      .catch(() => {});
  }, [id]);

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
        <Link href="/provider/schedule" className="mt-4 inline-block">
          <Button variant="outline">Back to schedule</Button>
        </Link>
      </div>
    );
  }

  const service = SERVICE_MAP[appointment.serviceId];
  const joinable = isJoinable(appointment);
  const cancellable =
    ["booked", "pending_payment"].includes(appointment.status) &&
    appointment.start > now;

  async function cancelVisit() {
    if (
      !(await confirm({
        title: "Cancel this visit?",
        message:
          "The patient will be notified and refunded in full automatically.",
        confirmLabel: "Cancel visit",
        cancelLabel: "Keep visit",
        destructive: true,
      }))
    )
      return;
    setCancelling(true);
    try {
      const res = await authedFetch(`/api/appointments/${id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const d = await res.json().catch(() => ({}));
      toast.success(
        "Visit cancelled",
        d.refunded
          ? `The patient has been notified and ${formatCurrency(d.refundedCents)} is being refunded.`
          : "The patient has been notified.",
      );
      router.push("/provider/schedule");
    } catch {
      toast.error("Couldn't cancel the visit");
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/provider/schedule"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Schedule
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {service?.name}
            </h1>
            <p className="text-[var(--muted-foreground)]">
              {formatDateTime(appointment.start)} · {formatCurrency(appointment.priceCents)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {appointment.isLive && <LiveBadge />}
            <Badge variant={appointment.status === "completed" ? "success" : "primary"}>
              {appointment.status.replace("_", " ")}
            </Badge>
            {joinable && (
              <>
                <WaitingBadge appointmentId={appointment.id} peer="client" />
                <Link href={`/visit/${appointment.id}`}>
                  <Button size="sm">
                    <Video className="h-4 w-4" /> Enter room
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
        {cancellable && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelVisit}
              disabled={cancelling}
            >
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Cancel visit
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="font-semibold">Patient</h2>
          </div>
          <Link
            href={`/provider/patients/${appointment.clientId}`}
            className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
          >
            <History className="h-4 w-4" /> View patient history
          </Link>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name" value={patient?.displayName} />
          <Field label="Email" value={patient?.email} />
          <Field label="Phone" value={patient?.phone || "—"} />
        </dl>
      </Card>

      <RxStatusCard appointment={appointment} audience="nurse" />

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Intake</h2>
        <IntakeSummary intake={intake} />
        <IntakePhotos paths={intake?.photoPaths ?? []} />
      </Card>

      {history && history.visits.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-1 font-semibold">Patient history</h2>
          <p className="mb-4 text-sm text-[var(--muted-foreground)]">
            {history.pastVisitCount} prior visit
            {history.pastVisitCount > 1 ? "s" : ""} with ARSkinRX.
          </p>
          <ul className="divide-y divide-[var(--border)]">
            {history.visits.map((v) => (
              <li
                key={v.appointmentId}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <span className="font-medium">
                  {SERVICE_MAP[v.serviceId]?.name ?? v.serviceId}
                </span>
                <span className="text-[var(--muted-foreground)]">
                  {formatDate(v.start)} · {v.providerName}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-semibold">Visit notes</h2>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Private clinical notes. Saved to the patient record; edits to a saved
          note are kept as amendments.
        </p>
        {noteLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
          </div>
        ) : (
          <SoapNoteEditor
            key={note?.updatedAt ?? "new"}
            appointmentId={appointment.id}
            note={note}
            history={noteHistory}
            canEdit
          />
        )}
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{value || "—"}</dd>
    </div>
  );
}
