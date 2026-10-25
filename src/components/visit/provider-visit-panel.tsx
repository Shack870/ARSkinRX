"use client";

import * as React from "react";
import { doc, setDoc } from "firebase/firestore";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  History,
  Loader2,
  PhoneOff,
  User,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { authedFetch } from "@/lib/api-client";
import { useUserProfile, useVisitNote } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDate } from "@/lib/datetime";
import { ageFromDob, formatDob } from "@/lib/dob";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IntakeSummary } from "@/components/intake-summary";
import { IntakePhotos } from "@/components/intake-photos";
import type { Appointment, IntakeResponse, ServiceType } from "@/lib/types";

type Notes = {
  subjective: string;
  assessment: string;
  plan: string;
  prescribed: string;
};

interface LastVisit {
  serviceId: ServiceType;
  start: number;
  providerName: string;
  subjective: string;
  assessment: string;
  plan: string;
  prescribed: string;
}

export function ProviderVisitPanel({
  appointment,
  intake,
  callEnded,
  onEndCall,
  onCompleted,
  onRegisterComplete,
}: {
  appointment: Appointment;
  intake: IntakeResponse | null;
  callEnded: boolean;
  /** Secondary: drop the video but stay on the page to finish notes. */
  onEndCall: () => void;
  onCompleted: () => void;
  /**
   * Lets the room's control bar trigger the same "End Appointment" flow
   * (confirm → save notes → mark completed) as the panel's button.
   */
  onRegisterComplete?: (fn: () => Promise<void>) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const { profile: patient } = useUserProfile(appointment.clientId);
  const { note } = useVisitNote(appointment.id);
  const [notes, setNotes] = React.useState<Notes>({
    subjective: "",
    assessment: "",
    plan: "",
    prescribed: "",
  });
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [history, setHistory] = React.useState<{
    pastVisitCount: number;
    lastVisit: LastVisit | null;
  } | null>(null);
  const [showLast, setShowLast] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const hydrated = React.useRef(false);

  // Hydrate notes once from any existing saved draft, then keep local state.
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

  // Load prior-visit history for continuity of care.
  React.useEffect(() => {
    authedFetch(`/api/appointments/${appointment.id}/patient-history`)
      .then((r) => r.json())
      .then((d) => setHistory(d))
      .catch(() => {});
  }, [appointment.id]);

  // Debounced autosave to the visit note doc (persists across reload).
  const notesRef = React.useRef(notes);
  React.useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  React.useEffect(() => {
    if (!hydrated.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, COLLECTIONS.visitNotes, appointment.id),
          {
            appointmentId: appointment.id,
            providerId: appointment.providerId,
            clientId: appointment.clientId,
            ...notesRef.current,
            updatedAt: Date.now(),
            createdAt: note?.createdAt ?? Date.now(),
          },
          { merge: true },
        );
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  function set(key: keyof Notes, value: string) {
    setNotes((n) => ({ ...n, [key]: value }));
  }

  // End Appointment: confirm → save notes → mark completed (frees the nurse
  // and rings the next patient in line) → leave the room.
  const completingRef = React.useRef(false);
  const complete = React.useCallback(async () => {
    if (completingRef.current) return;
    const ok = await confirm({
      title: "End appointment?",
      message:
        "This saves your notes, marks the visit completed, and emails the patient their summary. You'll be taken back to your dashboard.",
      confirmLabel: "End appointment",
    });
    if (!ok) return;
    completingRef.current = true;
    setCompleting(true);
    try {
      const res = await authedFetch(`/api/appointments/${appointment.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ notes: notesRef.current }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't complete the visit.");
      }
      onCompleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't complete the visit.");
      completingRef.current = false;
      setCompleting(false);
    }
  }, [appointment.id, confirm, onCompleted, toast]);

  React.useEffect(() => {
    onRegisterComplete?.(complete);
  }, [onRegisterComplete, complete]);

  const service = SERVICE_MAP[appointment.serviceId];
  const last = history?.lastVisit;
  const age = ageFromDob(patient?.dob);

  return (
    <div className="flex h-full flex-col bg-[var(--card)] text-[var(--foreground)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {patient?.displayName ?? "Patient"}
            {patient?.dob && (
              <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
                {formatDob(patient.dob)}
                {age !== null ? ` (${age})` : ""}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {service?.name}
            {history && history.pastVisitCount > 0
              ? ` · ${history.pastVisitCount} prior visit${history.pastVisitCount > 1 ? "s" : ""}`
              : " · New patient"}
            {patient?.phone ? ` · ${patient.phone}` : ""}
          </p>
        </div>
        <SaveBadge state={saveState} />
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Patient contact */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            <User className="h-3.5 w-3.5" /> Patient
          </h3>
          <p className="text-sm">{patient?.email}</p>
          {patient?.phone && <p className="text-sm">{patient.phone}</p>}
          {patient?.dob ? (
            <p className="text-sm">
              DOB {formatDob(patient.dob)}
              {age !== null ? ` · ${age} years old` : ""}
            </p>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">DOB not on file</p>
          )}
        </section>

        {/* Intake */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            <ClipboardList className="h-3.5 w-3.5" /> Intake
          </h3>
          <IntakeSummary intake={intake} />
          <IntakePhotos paths={intake?.photoPaths ?? []} />
        </section>

        {/* Last visit notes */}
        {last && (
          <section className="rounded-[var(--radius-md)] border border-[var(--border)]">
            <button
              onClick={() => setShowLast((s) => !s)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <History className="h-4 w-4 text-[var(--primary)]" />
                Last visit · {formatDate(last.start)}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showLast ? "rotate-180" : ""}`}
              />
            </button>
            {showLast && (
              <div className="space-y-2 border-t border-[var(--border)] px-3 py-3 text-sm">
                <p className="text-xs text-[var(--muted-foreground)]">
                  {SERVICE_MAP[last.serviceId]?.name ?? last.serviceId} ·{" "}
                  {last.providerName}
                </p>
                <PriorBlock label="Assessment" value={last.assessment} />
                <PriorBlock label="Plan" value={last.plan} />
                <PriorBlock label="Prescribed" value={last.prescribed} />
              </div>
            )}
          </section>
        )}

        {/* Notes form */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Visit notes
          </h3>
          <Field label="Subjective" value={notes.subjective} onChange={(v) => set("subjective", v)} />
          <Field label="Assessment" value={notes.assessment} onChange={(v) => set("assessment", v)} />
          <Field label="Plan" value={notes.plan} onChange={(v) => set("plan", v)} />
          <Field
            label="Prescribed"
            value={notes.prescribed}
            onChange={(v) => set("prescribed", v)}
            placeholder="Medications prescribed via your e-prescribe tool"
          />
        </section>
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t border-[var(--border)] p-4">
        <Button className="w-full" onClick={complete} disabled={completing}>
          {completing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          End Appointment
        </Button>
        {!callEnded ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[var(--muted-foreground)]"
            onClick={onEndCall}
          >
            <PhoneOff className="h-4 w-4" /> Disconnect video only (keep writing notes)
          </Button>
        ) : (
          <p className="text-center text-xs text-[var(--muted-foreground)]">
            Video disconnected. Finish your notes, then end the appointment.
          </p>
        )}
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Saved
      </span>
    );
  return null;
}

function Field({
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
      <Label className="text-xs">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[64px] text-sm"
      />
    </div>
  );
}

function PriorBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}
