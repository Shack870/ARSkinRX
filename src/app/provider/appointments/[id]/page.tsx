"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { ArrowLeft, Loader2, Save, User, Video, XCircle } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { authedFetch } from "@/lib/api-client";
import { useAppointment, useIntake, useUserProfile, useVisitNote } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import type { ServiceType } from "@/lib/types";
import { isJoinable } from "@/lib/appointment-window";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IntakeSummary } from "@/components/intake-summary";
import { IntakePhotos } from "@/components/intake-photos";
import { LiveBadge } from "@/components/live/live-badge";

export default function ProviderAppointmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [cancelling, setCancelling] = React.useState(false);
  const { appointment, loading } = useAppointment(id);
  const { profile: patient } = useUserProfile(appointment?.clientId);
  const { intake } = useIntake(appointment?.intakeId);
  const { note } = useVisitNote(id);

  const [notes, setNotes] = React.useState({
    subjective: "",
    assessment: "",
    plan: "",
    prescribed: "",
  });
  const [saving, setSaving] = React.useState(false);
  const [history, setHistory] = React.useState<{
    pastVisitCount: number;
    visits: { appointmentId: string; serviceId: ServiceType; start: number; providerName: string }[];
  } | null>(null);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    authedFetch(`/api/appointments/${id}/patient-history`)
      .then((r) => r.json())
      .then((d) => setHistory(d))
      .catch(() => {});
  }, [id]);

  React.useEffect(() => {
    if (hydrated.current || !note) return;
    setNotes({
      subjective: note.subjective ?? "",
      assessment: note.assessment ?? "",
      plan: note.plan ?? "",
      prescribed: note.prescribed ?? "",
    });
    hydrated.current = true;
  }, [note]);

  async function saveNotes() {
    if (!appointment) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, COLLECTIONS.visitNotes, appointment.id),
        {
          appointmentId: appointment.id,
          providerId: appointment.providerId,
          clientId: appointment.clientId,
          ...notes,
          updatedAt: Date.now(),
          createdAt: note?.createdAt ?? Date.now(),
        },
        { merge: true },
      );
      toast.success("Notes saved");
    } catch {
      toast.error("Couldn't save notes");
    } finally {
      setSaving(false);
    }
  }

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
    appointment.start > Date.now();

  async function cancelVisit() {
    if (
      !confirm(
        "Cancel this visit? The patient will be notified and is eligible for a refund.",
      )
    )
      return;
    setCancelling(true);
    try {
      const res = await authedFetch(`/api/appointments/${id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success("Visit cancelled", "The patient has been notified.");
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
              <Link href={`/visit/${appointment.id}`}>
                <Button size="sm">
                  <Video className="h-4 w-4" /> Join
                </Button>
              </Link>
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
        <div className="mb-3 flex items-center gap-2">
          <User className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="font-semibold">Patient</h2>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name" value={patient?.displayName} />
          <Field label="Email" value={patient?.email} />
          <Field label="Phone" value={patient?.phone || "—"} />
        </dl>
      </Card>

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
          Private clinical notes. Saved to the patient record.
        </p>
        <div className="space-y-3">
          <NoteField label="Subjective" value={notes.subjective} onChange={(v) => setNotes((n) => ({ ...n, subjective: v }))} />
          <NoteField label="Assessment" value={notes.assessment} onChange={(v) => setNotes((n) => ({ ...n, assessment: v }))} />
          <NoteField label="Plan" value={notes.plan} onChange={(v) => setNotes((n) => ({ ...n, plan: v }))} />
          <NoteField label="Prescribed" value={notes.prescribed} onChange={(v) => setNotes((n) => ({ ...n, prescribed: v }))} placeholder="Medications prescribed via your e-prescribe tool" />
        </div>
        <div className="mt-4">
          <Button onClick={saveNotes} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save notes
          </Button>
        </div>
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

function NoteField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[70px]"
      />
    </div>
  );
}
