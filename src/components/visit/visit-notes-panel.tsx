"use client";

import * as React from "react";
import { ChevronUp, Loader2, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IntakeResponse } from "@/lib/types";

const INTAKE_LABELS: Record<string, string> = {
  concern: "Main concern",
  duration: "Duration",
  medications: "Medications",
  allergies: "Allergies",
  pregnant: "Pregnant/breastfeeding",
};

/**
 * Collapsible SOAP note panel shown to the provider during the visit, with the
 * patient's intake at the top for reference. On "End & complete" the notes are
 * saved and the appointment is marked completed.
 */
export function VisitNotesPanel({
  intake,
  onEnd,
  ending,
}: {
  intake?: IntakeResponse | null;
  onEnd: (notes: Record<string, string>) => void;
  ending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState({
    subjective: "",
    assessment: "",
    plan: "",
    prescribed: "",
  });

  function set(k: keyof typeof notes, v: string) {
    setNotes((n) => ({ ...n, [k]: v }));
  }

  return (
    <div className="border-t border-neutral-800 bg-neutral-900 text-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
      >
        <span>Visit notes</span>
        <ChevronUp
          className={`h-4 w-4 transition-transform ${open ? "" : "rotate-180"}`}
        />
      </button>
      {open && (
        <div className="max-h-[40vh] space-y-3 overflow-y-auto px-4 pb-4">
          {intake && (
            <div className="rounded-md border border-neutral-700 bg-neutral-800/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Patient intake
              </p>
              <dl className="space-y-1.5 text-sm">
                {Object.entries(intake.answers ?? {}).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="shrink-0 text-neutral-400">
                      {INTAKE_LABELS[k] ?? k}:
                    </dt>
                    <dd className="text-neutral-100">
                      {Array.isArray(v) ? v.join(", ") : String(v) || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <Field
            label="Subjective"
            value={notes.subjective}
            onChange={(v) => set("subjective", v)}
            placeholder="Patient-reported concern and history"
          />
          <Field
            label="Assessment"
            value={notes.assessment}
            onChange={(v) => set("assessment", v)}
            placeholder="Your clinical assessment"
          />
          <Field
            label="Plan"
            value={notes.plan}
            onChange={(v) => set("plan", v)}
            placeholder="Treatment plan and follow-up"
          />
          <Field
            label="Prescribed"
            value={notes.prescribed}
            onChange={(v) => set("prescribed", v)}
            placeholder="Medications prescribed (sent via your e-prescribe tool)"
          />
        </div>
      )}
      <div className="flex justify-end p-4 pt-0">
        <Button variant="accent" onClick={() => onEnd(notes)} disabled={ending}>
          {ending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PhoneOff className="h-4 w-4" />
          )}
          End &amp; complete visit
        </Button>
      </div>
    </div>
  );
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
      <Label className="text-neutral-300">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[60px] border-neutral-700 bg-neutral-800 text-white placeholder:text-neutral-500"
      />
    </div>
  );
}
