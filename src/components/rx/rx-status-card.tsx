"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Clock, Pill, Send, X } from "lucide-react";
import { usePrescriptionsForAppointment } from "@/lib/hooks";
import { describeItem } from "@/lib/formulary";
import { formatDateTime } from "@/lib/datetime";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Appointment, Prescription } from "@/lib/types";

type Audience = "patient" | "nurse" | "admin";

const STATUS: Record<
  Prescription["status"],
  { label: string; variant: "warning" | "primary" | "success" | "danger"; icon: typeof Check }
> = {
  recommended: { label: "Awaiting review", variant: "warning", icon: Clock },
  approved: { label: "Approved — sending", variant: "primary", icon: Check },
  sent: { label: "Sent to pharmacy", variant: "success", icon: Send },
  declined: { label: "Declined", variant: "danger", icon: X },
};

/**
 * Prescription status for a completed visit, worded for whoever is looking.
 * Patients see plain-language progress (no drug names until sent); the nurse
 * and admin see the full record and timeline.
 */
export function RxStatusCard({
  appointment,
  audience,
}: {
  appointment: Appointment;
  audience: Audience;
}) {
  const { prescriptions, loading } = usePrescriptionsForAppointment(
    appointment.id,
    audience === "patient"
      ? { field: "clientId", uid: appointment.clientId }
      : audience === "nurse"
        ? { field: "providerId", uid: appointment.providerId }
        : undefined,
  );

  if (appointment.status !== "completed") return null;
  if (loading) return null;

  if (prescriptions.length === 0) {
    if (appointment.rxDecision === "none") {
      return (
        <Card className="p-5">
          <Title />
          <p className="text-sm text-[var(--muted-foreground)]">
            {audience === "patient"
              ? "No prescription was needed for this visit. Your plan is in the visit summary."
              : "No prescription recommended for this visit."}
          </p>
        </Card>
      );
    }
    return null;
  }

  if (audience === "patient") {
    // Declined items are handled by the nurse's call; status reflects the rest.
    const active = prescriptions.filter((p) => p.status !== "declined");
    const anyActive = active.length > 0;
    const allSent = anyActive && active.every((p) => p.status === "sent");
    const sent = active.filter((p) => p.status === "sent");
    return (
      <Card className="p-5">
        <Title />
        {allSent ? (
          <p className="text-sm">
            Your prescription was sent to{" "}
            <strong>{sent[0]?.pharmacy?.name ?? "your pharmacy"}</strong> on{" "}
            {formatDateTime(Math.max(...sent.map((p) => p.sentAt ?? 0)))}. The
            pharmacy will contact you when it&apos;s ready.
          </p>
        ) : anyActive ? (
          <p className="text-sm">
            Your prescription is being finalized and sent to your pharmacy. The
            pharmacy will contact you within 24 hours.
          </p>
        ) : (
          <p className="text-sm">
            Your nurse will be in touch about next steps for this visit.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <Title />
        {audience === "admin" &&
          prescriptions.some((p) => p.status === "recommended" || p.status === "approved") && (
            <Link
              href="/admin/prescriptions"
              className="text-sm text-[var(--primary)] hover:underline"
            >
              Open queue
            </Link>
          )}
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {prescriptions.map((p) => {
          const st = STATUS[p.status];
          const item = p.final ?? p.recommended;
          const edited =
            p.final && JSON.stringify(p.final) !== JSON.stringify(p.recommended);
          return (
            <li key={p.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{describeItem(item)}</p>
                  <p className="text-[var(--muted-foreground)]">{item.sig}</p>
                  {edited && (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      Recommended as: {describeItem(p.recommended)}
                    </p>
                  )}
                </div>
                <Badge variant={st.variant}>{st.label}</Badge>
              </div>
              <ol className="mt-2 space-y-0.5 text-xs text-[var(--muted-foreground)]">
                <li>
                  Recommended by {p.recommendedByName} · {formatDateTime(p.recommendedAt)}
                </li>
                {p.reviewedAt && (
                  <li>
                    {p.status === "declined" ? "Declined" : "Approved"} by{" "}
                    {p.reviewedByName} · {formatDateTime(p.reviewedAt)}
                    {p.declineReason ? ` — ${p.declineReason}` : ""}
                  </li>
                )}
                {p.sentAt && (
                  <li>
                    Sent to {p.pharmacy?.name ?? "pharmacy"} · {formatDateTime(p.sentAt)}
                    {p.sentVia ? ` (${p.sentVia})` : ""}
                  </li>
                )}
              </ol>
              {audience === "nurse" && p.status === "declined" && (
                <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-2 py-1.5 text-xs text-[var(--accent)]">
                  Please call the patient to discuss. They have not been notified.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Title() {
  return (
    <h2 className="mb-1 flex items-center gap-2 font-semibold">
      <Pill className="h-4 w-4 text-[var(--primary)]" /> Prescription
    </h2>
  );
}
