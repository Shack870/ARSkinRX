"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Inbox,
  Loader2,
  MapPin,
  Phone,
  Send,
  Stethoscope,
  User,
  X,
} from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { describeItem } from "@/lib/formulary";
import { ageFromDob, formatDob } from "@/lib/dob";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { IntakeSummary } from "@/components/intake-summary";
import { IntakePhotos } from "@/components/intake-photos";
import { RxItemFields } from "@/components/rx/rx-item-fields";
import type {
  IntakeResponse,
  PatientPharmacy,
  Prescription,
  PrescriptionItem,
  VisitNote,
} from "@/lib/types";
import type { RxQueueRow } from "@/app/api/admin/prescriptions/route";

interface Detail {
  prescription: Prescription;
  patient: {
    uid: string;
    displayName: string;
    email: string | null;
    phone: string | null;
    dob: string | null;
    pharmacy: PatientPharmacy | null;
  };
  nurse: { uid: string; displayName: string };
  appointment: {
    id: string;
    serviceName: string;
    start: number | null;
    isLive: boolean;
    priceCents: number;
    refundId: string | null;
  };
  note: VisitNote | null;
  intake: IntakeResponse | null;
  siblings: { id: string; status: Prescription["status"]; item: PrescriptionItem }[];
  prior: {
    id: string;
    status: Prescription["status"];
    item: PrescriptionItem;
    at: number;
    serviceName: string;
  }[];
}

type Tab = "review" | "send";

export default function AdminPrescriptionsPage() {
  const [tab, setTab] = React.useState<Tab>("review");
  const [toReview, setToReview] = React.useState<RxQueueRow[]>([]);
  const [toSend, setToSend] = React.useState<RxQueueRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const toast = useToast();

  const load = React.useCallback(async () => {
    try {
      const r = await authedFetch("/api/admin/prescriptions");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setToReview(d.toReview ?? []);
      setToSend(d.toSend ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load prescriptions");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prescriptions</h1>
        <p className="text-[var(--muted-foreground)]">
          Review what your nurses recommended, then send approved prescriptions
          to each patient&apos;s pharmacy. Once marked sent, the record lives on
          the visit in Appointments.
        </p>
      </div>

      <div className="flex gap-2">
        <TabButton
          active={tab === "review"}
          onClick={() => setTab("review")}
          icon={ClipboardList}
          label="To review"
          count={toReview.length}
        />
        <TabButton
          active={tab === "send"}
          onClick={() => setTab("send")}
          icon={Send}
          label="Send to pharmacy"
          count={toSend.length}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        </div>
      ) : tab === "review" ? (
        <ReviewQueue rows={toReview} onChanged={load} />
      ) : (
        <SendList rows={toSend} onChanged={load} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-medium transition-colors " +
        (active
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]")
      }
    >
      <Icon className="h-4 w-4" />
      {label}
      <span
        className={
          "rounded-full px-2 py-0.5 text-xs " +
          (count > 0
            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "bg-[var(--muted)] text-[var(--muted-foreground)]")
        }
      >
        {count}
      </span>
    </button>
  );
}

/* ───────────────────────────── Review queue ───────────────────────────── */

function ReviewQueue({
  rows,
  onChanged,
}: {
  rows: RxQueueRow[];
  onChanged: () => Promise<void>;
}) {
  const current = rows[0];
  if (!current) {
    return (
      <Empty
        icon={Inbox}
        title="Nothing to review"
        body="When a nurse recommends a prescription at the end of a visit, it shows up here."
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        Reviewing 1 of {rows.length} · oldest first
      </p>
      <ReviewCard key={current.id} id={current.id} onDone={onChanged} />
    </div>
  );
}

function ReviewCard({ id, onDone }: { id: string; onDone: () => Promise<void> }) {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [item, setItem] = React.useState<PrescriptionItem | null>(null);
  const [busy, setBusy] = React.useState<"approve" | "decline" | null>(null);
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const confirm = useConfirm();
  const toast = useToast();

  React.useEffect(() => {
    authedFetch(`/api/admin/prescriptions/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setDetail(d);
        setItem(d.prescription.recommended);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load"));
  }, [id, toast]);

  async function approve() {
    if (!item || !detail) return;
    if (!item.drug.trim() || !item.sig.trim()) {
      toast.error("Drug name and directions are required.");
      return;
    }
    const edited = JSON.stringify(item) !== JSON.stringify(detail.prescription.recommended);
    setBusy("approve");
    try {
      const r = await authedFetch(`/api/admin/prescriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve", final: edited ? item : undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success("Approved", "Added to your Send to pharmacy list.");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't approve");
      setBusy(null);
    }
  }

  async function decline() {
    if (!detail) return;
    if (reason.trim().length < 3) {
      toast.error("Add a short reason for the nurse.");
      return;
    }
    const others = detail.siblings.filter((s) => s.status !== "declined").length;
    const ok = await confirm({
      title: "Deny this prescription?",
      message: others
        ? `The nurse will be asked to call ${detail.patient.displayName}. No refund yet — ${others} other item${others === 1 ? "" : "s"} from this visit ${others === 1 ? "is" : "are"} still active.`
        : `${detail.patient.displayName} will be refunded ${formatCurrency(detail.appointment.priceCents)} and the nurse will be asked to call them. The patient is not messaged.`,
      confirmLabel: others ? "Deny" : "Deny and refund",
      destructive: true,
    });
    if (!ok) return;
    setBusy("decline");
    try {
      const r = await authedFetch(`/api/admin/prescriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "decline", reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(
        "Declined",
        d.refunded ? "Visit refunded; nurse notified." : "Nurse notified.",
      );
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't decline");
      setBusy(null);
    }
  }

  if (!detail || !item) {
    return (
      <Card className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </Card>
    );
  }

  const { patient, nurse, appointment, note, intake, prescription, prior, siblings } =
    detail;
  const age = ageFromDob(patient.dob);
  const missing: string[] = [];
  if (!patient.dob) missing.push("date of birth");
  if (!patient.pharmacy?.name) missing.push("pharmacy");

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--muted)]/50 p-5">
        <div>
          <h2 className="text-lg font-semibold">
            {patient.displayName}
            {patient.dob && (
              <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
                {formatDob(patient.dob)}
                {age !== null ? ` (${age})` : ""}
              </span>
            )}
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            {appointment.serviceName}
            {appointment.isLive ? " · Live visit" : ""}
            {appointment.start ? ` · ${formatDateTime(appointment.start)}` : ""}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <Stethoscope className="h-4 w-4 text-[var(--primary)]" />
            Recommended by <strong>{nurse.displayName}</strong>
            <span className="text-[var(--muted-foreground)]">
              · {formatDateTime(prescription.recommendedAt)}
            </span>
          </p>
        </div>
        <Link
          href={`/admin/appointments/${appointment.id}`}
          className="text-sm text-[var(--primary)] hover:underline"
        >
          Open visit
        </Link>
      </div>

      {missing.length > 0 && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Patient is missing {missing.join(" and ")}. You can still approve; you&apos;ll
            need it before sending.
          </span>
        </div>
      )}

      <div className="grid gap-6 p-5 lg:grid-cols-5">
        {/* Left: context */}
        <div className="space-y-5 lg:col-span-3">
          <section>
            <SectionTitle icon={User}>Patient</SectionTitle>
            <div className="text-sm">
              {patient.phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  {patient.phone}
                </p>
              )}
              {patient.email && <p>{patient.email}</p>}
              {!patient.dob && (
                <p className="text-[var(--muted-foreground)]">DOB not on file</p>
              )}
            </div>
          </section>

          <section>
            <SectionTitle icon={MapPin}>Pharmacy</SectionTitle>
            <PharmacyBlock pharmacy={patient.pharmacy} />
          </section>

          <section>
            <SectionTitle icon={ClipboardList}>Intake</SectionTitle>
            <IntakeSummary intake={intake} />
            <IntakePhotos paths={intake?.photoPaths ?? []} />
          </section>

          <section>
            <SectionTitle icon={Stethoscope}>{nurse.displayName}&apos;s note</SectionTitle>
            {note ? (
              <div className="space-y-2 text-sm">
                <Block label="Subjective" value={note.subjective} />
                <Block label="Assessment" value={note.assessment} />
                <Block label="Plan" value={note.plan} />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No note saved.</p>
            )}
          </section>

          {(siblings.length > 0 || prior.length > 0) && (
            <section className="space-y-2 text-sm">
              {siblings.length > 0 && (
                <div>
                  <SectionTitle>Also from this visit</SectionTitle>
                  <ul className="space-y-1">
                    {siblings.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2">
                        <span>{describeItem(s.item)}</span>
                        <StatusBadge status={s.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {prior.length > 0 && (
                <div>
                  <SectionTitle>Previous prescriptions</SectionTitle>
                  <ul className="space-y-1">
                    {prior.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span>
                          {describeItem(p.item)}
                          <span className="text-[var(--muted-foreground)]">
                            {" "}
                            · {p.serviceName} · {formatDate(p.at)}
                          </span>
                        </span>
                        <StatusBadge status={p.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right: the decision */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-[var(--radius-md)] border border-[var(--primary)]/30 bg-[var(--primary-soft)]/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
              Recommendation
            </p>
            <p className="mt-1 font-medium">{describeItem(prescription.recommended)}</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              {prescription.recommended.sig}
            </p>
            {prescription.reason && (
              <p className="mt-2 text-sm">
                <span className="text-[var(--muted-foreground)]">Why:</span>{" "}
                {prescription.reason}
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Edit before approving (optional)
            </p>
            <RxItemFields
              idPrefix={`rx-${id}`}
              value={item}
              onChange={setItem}
              serviceId={prescription.serviceId}
              compact
            />
          </div>

          {!declining ? (
            <div className="space-y-2">
              <Button
                className="w-full"
                size="lg"
                onClick={approve}
                disabled={busy !== null}
              >
                {busy === "approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setDeclining(true)}
                disabled={busy !== null}
              >
                <X className="h-4 w-4" /> Deny
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--accent)]/40 p-3">
              <Label htmlFor={`reason-${id}`} className="text-xs">
                Reason (the nurse will see this and call the patient)
              </Label>
              <Textarea
                id={`reason-${id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Contraindicated with listed medication; recommend OTC alternative."
                className="min-h-[72px] text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="accent"
                  className="flex-1"
                  onClick={decline}
                  disabled={busy !== null}
                >
                  {busy === "decline" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  Confirm deny
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDeclining(false);
                    setReason("");
                  }}
                  disabled={busy !== null}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────────── Send list ───────────────────────────── */

function SendList({
  rows,
  onChanged,
}: {
  rows: RxQueueRow[];
  onChanged: () => Promise<void>;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [via, setVia] = React.useState<Record<string, string>>({});
  const toast = useToast();

  async function markSent(row: RxQueueRow) {
    setBusyId(row.id);
    try {
      const r = await authedFetch(`/api/admin/prescriptions/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "sent", via: via[row.id] ?? "" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success("Marked sent", `${row.patientName} · ${row.item.drug}`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't mark sent");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Empty
        icon={Send}
        title="Nothing waiting to be sent"
        body="Approved prescriptions appear here until you mark them sent to the pharmacy."
      />
    );
  }

  // Group by patient so multi-drug visits sit together.
  const groups = new Map<string, RxQueueRow[]>();
  for (const r of rows) {
    const list = groups.get(r.patientId) ?? [];
    list.push(r);
    groups.set(r.patientId, list);
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.values()).map((list) => {
        const first = list[0];
        const age = ageFromDob(first.patientDob);
        return (
          <Card key={first.patientId} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {first.patientName}
                  {first.patientDob && (
                    <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
                      DOB {formatDob(first.patientDob)}
                      {age !== null ? ` (${age})` : ""}
                    </span>
                  )}
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {first.patientPhone ? `${first.patientPhone} · ` : ""}
                  {first.serviceName} with {first.nurseName} ·{" "}
                  {formatDate(first.visitStart)}
                </p>
              </div>
              <PharmacyBlock pharmacy={first.pharmacy} compact />
            </div>

            <ul className="mt-4 divide-y divide-[var(--border)]">
              {list.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{describeItem(row.item)}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">{row.item.sig}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={via[row.id] ?? ""}
                      onChange={(e) => setVia((v) => ({ ...v, [row.id]: e.target.value }))}
                      placeholder="How sent (optional)"
                      className="h-9 w-40 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => markSent(row)}
                      disabled={busyId !== null}
                    >
                      {busyId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Sent to pharmacy
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── bits ───────────────────────────── */

function PharmacyBlock({
  pharmacy,
  compact,
}: {
  pharmacy: PatientPharmacy | null | undefined;
  compact?: boolean;
}) {
  if (!pharmacy?.name) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-amber-700">
        <AlertTriangle className="h-4 w-4" /> No pharmacy on file
      </p>
    );
  }
  return (
    <div className={compact ? "text-right text-sm" : "text-sm"}>
      <p className="font-medium">{pharmacy.name}</p>
      {pharmacy.location && (
        <p className="text-[var(--muted-foreground)]">{pharmacy.location}</p>
      )}
      {pharmacy.phone && (
        <p className="text-[var(--muted-foreground)]">{pharmacy.phone}</p>
      )}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </h3>
  );
}

function Block({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-[var(--muted-foreground)]">{label}</p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Prescription["status"] }) {
  const map: Record<Prescription["status"], { label: string; variant: "warning" | "primary" | "success" | "danger" }> = {
    recommended: { label: "Awaiting review", variant: "warning" },
    approved: { label: "Approved", variant: "primary" },
    sent: { label: "Sent", variant: "success" },
    declined: { label: "Declined", variant: "danger" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function Empty({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card className="p-12 text-center">
      <Icon className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{body}</p>
    </Card>
  );
}
