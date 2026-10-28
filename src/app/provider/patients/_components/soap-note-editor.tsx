"use client";

import * as React from "react";
import { History, Loader2, Save } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/datetime";
import type { VisitNote, VisitNoteHistoryEntry } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export const NOTE_FIELDS = [
  { key: "subjective", label: "Subjective", placeholder: "" },
  { key: "assessment", label: "Assessment", placeholder: "" },
  { key: "plan", label: "Plan", placeholder: "" },
  {
    key: "prescribed",
    label: "Prescribed",
    placeholder: "",
    /** Filled from the End Appointment medication recommendation; not free-text. */
    readOnly: true,
  },
] as const;
export type NoteFieldKey = (typeof NOTE_FIELDS)[number]["key"];
export type NoteDraft = Record<NoteFieldKey, string>;

export function draftFromNote(note: VisitNote | null | undefined): NoteDraft {
  return {
    subjective: note?.subjective ?? "",
    assessment: note?.assessment ?? "",
    plan: note?.plan ?? "",
    prescribed: note?.prescribed ?? "",
  };
}

function hasContent(d: NoteDraft) {
  return NOTE_FIELDS.some((f) => d[f.key].trim().length > 0);
}

/**
 * Inline SOAP note editor. Saves through PATCH /api/appointments/[id]/notes so
 * amendments are archived server-side. Mount with
 * `key={note?.updatedAt}` so the draft resets when a newer version arrives.
 */
export function SoapNoteEditor({
  appointmentId,
  note,
  history,
  canEdit,
  onSaved,
  compact = false,
}: {
  appointmentId: string;
  note: VisitNote | null;
  history: VisitNoteHistoryEntry[];
  canEdit: boolean;
  /** Called with the saved note; `amended` is true when a prior version was archived. */
  onSaved?: (note: VisitNote, amended: boolean) => void;
  compact?: boolean;
}) {
  const toast = useToast();
  const [draft, setDraft] = React.useState<NoteDraft>(() => draftFromNote(note));
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const saved = draftFromNote(note);
  const dirty = NOTE_FIELDS.some((f) => draft[f.key] !== saved[f.key]);
  const isAmendment = dirty && hasContent(saved);

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await authedFetch(`/api/appointments/${appointmentId}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ ...draft, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't save notes");
      toast.success(data.amended ? "Note amended" : "Notes saved");
      setReason("");
      if (data.note) onSaved?.(data.note as VisitNote, Boolean(data.amended));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save notes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {NOTE_FIELDS.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            {canEdit && !("readOnly" in f && f.readOnly) ? (
              <Textarea
                value={draft[f.key]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder || undefined}
                className={compact ? "min-h-[56px]" : "min-h-[70px]"}
              />
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {draft[f.key] || <span className="text-[var(--muted-foreground)]">—</span>}
                {canEdit && "readOnly" in f && f.readOnly && (
                  <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                    Set from the medication recommendation at End Appointment. Prescriptions
                    go through Crystal&apos;s review, not this note.
                  </span>
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {isAmendment && (
            <div className="min-w-[220px] flex-1">
              <Label>Reason for amendment (optional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. corrected dosage"
                maxLength={500}
              />
            </div>
          )}
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isAmendment ? "Save amendment" : "Save notes"}
          </Button>
        </div>
      )}

      {note?.updatedAt && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Last edited {formatDateTime(note.updatedAt)}
          {note.updatedByName ? ` by ${note.updatedByName}` : ""}
        </p>
      )}

      {history.length > 0 && (
        <details className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)]">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
            <History className="h-4 w-4 text-[var(--muted-foreground)]" />
            Amendments ({history.length})
          </summary>
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {history.map((h) => (
              <li key={h.id} className="px-3 py-3 text-sm">
                <p className="text-xs text-[var(--muted-foreground)]">
                  Replaced {formatDateTime(h.editedAt)} by {h.editedByName}
                  {h.reason ? ` · ${h.reason}` : ""}
                  {h.versionSavedAt ? ` · this version saved ${formatDateTime(h.versionSavedAt)}` : ""}
                </p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  {NOTE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                        {f.label}
                      </dt>
                      <dd className="whitespace-pre-wrap">{h[f.key] || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
