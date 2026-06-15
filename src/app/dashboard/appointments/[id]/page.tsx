"use client";

import * as React from "react";
import { Suspense, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Video,
} from "lucide-react";
import { useAppointment, useIntake, useVisitNote } from "@/lib/hooks";
import { authedFetch } from "@/lib/api-client";
import { IntakeSummary } from "@/components/intake-summary";
import { IntakePhotos } from "@/components/intake-photos";
import { DeviceCheck } from "@/components/device-check";
import { LiveBadge } from "@/components/live/live-badge";
import { SERVICE_MAP } from "@/lib/services";
import { formatCurrency } from "@/lib/utils";
import { formatDate, formatDateTime, formatTime } from "@/lib/datetime";
import { isJoinable, windowState } from "@/lib/appointment-window";
import { HoldTimer } from "@/components/hold-timer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm";
import type { Appointment } from "@/lib/types";

export default function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense>
      <Detail id={id} />
    </Suspense>
  );
}

function Detail({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { appointment, loading } = useAppointment(id);
  const { note } = useVisitNote(id);
  const { intake } = useIntake(appointment?.intakeId);
  const [now, setNow] = React.useState(Date.now());
  const [cancelling, setCancelling] = React.useState(false);
  const [showReschedule, setShowReschedule] = React.useState(false);
  const confirm = useConfirm();
  const verifiedRef = React.useRef(false);

  async function cancelVisit() {
    if (!appointment) return;
    const within48 = appointment.start - Date.now() < 48 * 60 * 60 * 1000;
    const ok = await confirm({
      title: "Cancel this visit?",
      message: within48
        ? "It's within 48 hours, so it isn't eligible for a refund per our policy."
        : "You'll be eligible for a refund.",
      confirmLabel: "Cancel visit",
      cancelLabel: "Keep visit",
      destructive: true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const res = await authedFetch(`/api/appointments/${id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
    } catch {
      setCancelling(false);
    }
  }

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // On return from Stripe, verify the session and confirm the booking.
  React.useEffect(() => {
    const sessionId = search.get("session_id");
    if (
      search.get("paid") === "1" &&
      sessionId &&
      appointment?.status === "pending_payment" &&
      !verifiedRef.current
    ) {
      verifiedRef.current = true;
      authedFetch("/api/checkout/verify", {
        method: "POST",
        body: JSON.stringify({ appointmentId: id, sessionId }),
      }).catch(() => {});
    }
  }, [search, appointment?.status, id]);

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
        <Link href="/dashboard" className="mt-4 inline-block">
          <Button variant="outline">Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  const service = SERVICE_MAP[appointment.serviceId];
  const state = windowState(appointment, now);
  const joinable = isJoinable(appointment, now);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      {search.get("paid") && appointment.status !== "pending_payment" && (
        <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          Payment received — your visit is confirmed!
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {service?.name}
            </h1>
            <p className="text-[var(--muted-foreground)]">
              {formatDateTime(appointment.start)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {appointment.isLive && <LiveBadge />}
            <StatusBadge appt={appointment} />
          </div>
        </div>
        <dl className="mt-5 space-y-2 border-t border-[var(--border)] pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--muted-foreground)]">Duration</dt>
            <dd>{service?.durationMinutes} minutes</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--muted-foreground)]">Paid</dt>
            <dd>{formatCurrency(appointment.priceCents)}</dd>
          </div>
        </dl>
      </Card>

      {appointment.status === "pending_payment" && (
        <PendingPayment
          appointmentId={appointment.id}
          holdExpiresAt={appointment.holdExpiresAt}
        />
      )}

      {appointment.status === "booked" && state === "future" && (
        <Card className="p-6 text-center">
          <CalendarClock className="mx-auto h-9 w-9 text-[var(--primary)]" />
          <h2 className="mt-3 font-semibold">You&apos;re all set</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Your visit starts {formatDate(appointment.start)} at{" "}
            {formatTime(appointment.start)}. The Join button appears 5 minutes
            before.
          </p>
          <Countdown to={appointment.start - 5 * 60 * 1000} now={now} />
          <div className="mt-5 flex justify-center">
            <DeviceCheck />
          </div>
        </Card>
      )}

      {joinable && (
        <Card className="border-[var(--primary)] bg-[var(--primary-soft)] p-6 text-center">
          <Video className="mx-auto h-9 w-9 text-[var(--primary)]" />
          <h2 className="mt-3 font-semibold text-[var(--primary)]">
            Your provider is ready for you
          </h2>
          <p className="mt-1 text-sm text-[var(--primary)]/80">
            Your visit window is open until {formatTime(appointment.end)}.
          </p>
          <Link href={`/visit/${appointment.id}`} className="mt-4 inline-block">
            <Button size="lg">
              <Video className="h-4 w-4" /> Join video visit
            </Button>
          </Link>
        </Card>
      )}

      {appointment.status === "booked" && state === "ended" && (
        <Card className="border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          <p className="font-medium">Your visit window has passed.</p>
          <p className="mt-1 text-sm text-amber-700">
            We&apos;ll update this shortly. If you missed it, you can reschedule
            for free.
          </p>
        </Card>
      )}

      {appointment.status === "no_show" && !appointment.rescheduledToId && (
        <ReschedulePanel appointment={appointment} />
      )}

      {appointment.status === "rescheduled" && appointment.rescheduledToId && (
        <Card className="p-6 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            This visit was rescheduled.
          </p>
          <Button
            className="mt-3"
            variant="soft"
            onClick={() =>
              router.push(
                `/dashboard/appointments/${appointment.rescheduledToId}`,
              )
            }
          >
            View new visit
          </Button>
        </Card>
      )}

      {appointment.status === "completed" && (
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <h2 className="font-semibold">Visit summary</h2>
          </div>
          {note && (note.plan || note.prescribed || note.assessment) ? (
            <dl className="mt-4 space-y-4">
              {note.assessment && (
                <SummaryBlock label="Assessment" value={note.assessment} />
              )}
              {note.plan && <SummaryBlock label="Your plan" value={note.plan} />}
              {note.prescribed && (
                <SummaryBlock label="Prescribed" value={note.prescribed} />
              )}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Thanks for visiting ARSkinRX. Your provider&apos;s plan and any
              prescriptions will be shared as discussed.
            </p>
          )}
        </Card>
      )}

      {intake && (
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">What you told us</h2>
          <IntakeSummary intake={intake} />
          <IntakePhotos paths={intake?.photoPaths ?? []} />
        </Card>
      )}

      {appointment.status === "booked" &&
        appointment.start > now &&
        showReschedule && (
          <ReschedulePanel
            appointment={appointment}
            title="Reschedule your visit"
            subtitle="Pick a new time — your payment carries over, no extra charge."
          />
        )}

      {["booked", "pending_payment"].includes(appointment.status) &&
        appointment.start > now && (
          <div className="flex flex-col items-center gap-2 text-center">
            {appointment.status === "booked" && !showReschedule && (
              <Button variant="outline" onClick={() => setShowReschedule(true)}>
                <CalendarClock className="h-4 w-4" /> Reschedule
              </Button>
            )}
            <button
              onClick={cancelVisit}
              disabled={cancelling}
              className="text-sm text-[var(--muted-foreground)] underline hover:text-[var(--accent)] disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel this visit"}
            </button>
            <p className="text-xs text-[var(--muted-foreground)]">
              Free reschedule anytime · no refunds within 48 hours
            </p>
          </div>
        )}
    </div>
  );
}

function PendingPayment({
  appointmentId,
  holdExpiresAt,
}: {
  appointmentId: string;
  holdExpiresAt?: number;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expired, setExpired] = React.useState(
    holdExpiresAt ? holdExpiresAt <= Date.now() : false,
  );
  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ appointmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payment failed.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }
  return (
    <Card className="border-amber-200 bg-amber-50 p-6 text-center">
      <h2 className="font-semibold text-amber-800">Finish your booking</h2>
      <p className="mt-1 text-sm text-amber-700">
        Complete payment to lock in this time.
      </p>
      {holdExpiresAt && !expired && (
        <div className="mt-3 flex justify-center">
          <HoldTimer expiresAt={holdExpiresAt} onExpire={() => setExpired(true)} />
        </div>
      )}
      {expired ? (
        <div className="mt-4 text-sm text-[var(--accent)]">
          <p className="font-medium">Your hold expired.</p>
          <Link href="/book" className="mt-3 inline-block">
            <Button variant="accent" size="sm">
              Book a new time
            </Button>
          </Link>
        </div>
      ) : (
        <Button className="mt-4" onClick={pay} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Complete payment
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-[var(--accent)]">{error}</p>}
    </Card>
  );
}

function ReschedulePanel({
  appointment,
  title = "Reschedule — free of charge",
  subtitle = "Pick a new time. You won't be charged again.",
}: {
  appointment: Appointment;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const [slots, setSlots] = React.useState<{ start: number; end: number }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(
      `/api/slots?providerId=${appointment.providerId}&serviceId=${appointment.serviceId}`,
    )
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .finally(() => setLoading(false));
  }, [appointment.providerId, appointment.serviceId]);

  async function pick(start: number) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/appointments/${appointment.id}/reschedule`,
        { method: "POST", body: JSON.stringify({ start }) },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reschedule.");
      router.push(`/dashboard/appointments/${data.appointmentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const byDay = new Map<string, { start: number; end: number }[]>();
  for (const s of slots) {
    const k = formatDate(s.start);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{subtitle}</p>
      {loading ? (
        <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-[var(--primary)]" />
      ) : slots.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          No open times right now — please check back soon.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {Array.from(byDay.entries()).map(([day, daySlots]) => (
            <div key={day}>
              <p className="mb-2 text-sm font-medium text-[var(--muted-foreground)]">
                {day}
              </p>
              <div className="flex flex-wrap gap-2">
                {daySlots.map((s) => (
                  <button
                    key={s.start}
                    disabled={submitting}
                    onClick={() => pick(s.start)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm transition-colors hover:border-[var(--primary)] disabled:opacity-50"
                  >
                    {formatTime(s.start)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-[var(--accent)]">{error}</p>}
    </Card>
  );
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function StatusBadge({ appt }: { appt: Appointment }) {
  switch (appt.status) {
    case "pending_payment":
      return <Badge variant="warning">Payment pending</Badge>;
    case "booked":
      return <Badge variant="primary">Booked</Badge>;
    case "in_progress":
      return <Badge variant="success">In progress</Badge>;
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "no_show":
      return <Badge variant="danger">Missed</Badge>;
    case "rescheduled":
      return <Badge>Rescheduled</Badge>;
    default:
      return <Badge>{appt.status}</Badge>;
  }
}

function Countdown({ to, now }: { to: number; now: number }) {
  const diff = Math.max(0, to - now);
  const h = Math.floor(diff / 3.6e6);
  const m = Math.floor((diff % 3.6e6) / 6e4);
  const s = Math.floor((diff % 6e4) / 1000);
  if (diff <= 0) return null;
  return (
    <p className="mt-4 font-mono text-2xl font-semibold tracking-tight text-[var(--primary)]">
      {h > 0 ? `${h}h ` : ""}
      {m}m {s}s
    </p>
  );
}
