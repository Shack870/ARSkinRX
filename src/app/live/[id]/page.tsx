"use client";

import * as React from "react";
import { Suspense, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Loader2,
  Pill,
  Radar,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLiveRequest } from "@/lib/hooks";
import { authedFetch } from "@/lib/api-client";
import { SERVICE_MAP } from "@/lib/services";
import { formatCurrency } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/datetime";
import {
  SCHEDULE_INSTEAD_REFUND_CENTS,
  SCHEDULE_INSTEAD_WAIT_MS,
  ordinal,
} from "@/lib/live-queue-math";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { FinishAccountCard } from "@/components/finish-account-card";
import { usePaymentResume } from "@/lib/use-payment-resume";
import { markAutoJoin } from "@/lib/auto-join";
import type { LiveRequest } from "@/lib/types";

export default function LivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense>
      <LiveInner id={id} />
    </Suspense>
  );
}

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function aboutMinutes(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  return `about ${m} min`;
}

/**
 * Warm up the camera + mic as soon as the patient is through the account gate
 * so the permission prompt happens while they wait, not when the nurse is
 * already in the room. The stream is a preview only — the visit page requests
 * its own (the browser remembers the grant).
 */
function useSelfPreview(enabled: boolean) {
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let s: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((got) => {
        if (cancelled) {
          got.getTracks().forEach((t) => t.stop());
          return;
        }
        s = got;
        setStream(got);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error && (e.name === "NotAllowedError" || e.name === "NotFoundError")
            ? "Camera or microphone access was blocked. Allow access in your browser's address bar so your visit can start automatically."
            : "Couldn't start your camera. Close other apps using it and reload.",
        );
      });
    return () => {
      cancelled = true;
      s?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [enabled]);
  return { stream, error };
}

function SelfView({
  stream,
  error,
}: {
  stream: MediaStream | null;
  error: string | null;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="mx-auto mt-5 w-40">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-[var(--border)] bg-neutral-900 shadow-sm">
        <video
          ref={ref}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover ${stream ? "" : "opacity-0"}`}
          style={{ transform: "scaleX(-1)" }}
        />
        {!stream && (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
            {error ? <VideoOff className="h-6 w-6" /> : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        )}
        {stream && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            Camera ready
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-left text-xs text-[var(--accent)]">{error}</p>
      )}
    </div>
  );
}

function LiveInner({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();
  const { request, loading } = useLiveRequest(id);
  const verifiedRef = React.useRef(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const [showScheduler, setShowScheduler] = React.useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  // Guest who paid but has no session here (other origin/device): resume
  // from the paid Stripe session before falling back to login.
  const resuming = usePaymentResume();
  const needsPassword = profile?.passwordSet === false;

  const status = request?.status;
  const paid = status === "searching" || status === "queued" || status === "matched";
  // Post-payment account gate: nothing proceeds (visually) until the patient
  // has a password + DOB on file. Matching keeps running server-side.
  const gated = paid && needsPassword;
  const waiting = (status === "searching" || status === "queued") && !gated;

  React.useEffect(() => {
    if (!authLoading && !resuming && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/live/${id}`)}`);
    }
  }, [authLoading, resuming, user, router, id]);

  // Clock for countdowns.
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Verify payment on return from Stripe.
  React.useEffect(() => {
    const sessionId = search.get("session_id");
    if (
      search.get("paid") === "1" &&
      sessionId &&
      status === "pending_payment" &&
      !verifiedRef.current
    ) {
      verifiedRef.current = true;
      authedFetch("/api/live/verify", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: id, sessionId }),
      }).catch(() => {});
    }
  }, [search, status, id]);

  // While searching or in line, nudge the matcher / queue every few seconds.
  React.useEffect(() => {
    if (status !== "searching" && status !== "queued") return;
    const tick = () =>
      authedFetch("/api/live/match", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: id }),
      }).catch(() => {});
    tick();
    const interval = setInterval(tick, 4000);
    return () => clearInterval(interval);
  }, [status, id]);

  // Camera/mic warm-up once through the gate.
  const { stream, error: mediaError } = useSelfPreview(waiting);

  // Matched → straight into the room (no lobby). Held only while gated.
  React.useEffect(() => {
    if (status === "matched" && request?.appointmentId && !gated) {
      markAutoJoin(request.appointmentId);
      router.replace(`/visit/${request.appointmentId}?auto=1`);
    }
  }, [status, request?.appointmentId, gated, router]);

  async function cancel() {
    if (!request) return;
    const paidNow = request.status === "searching" || request.status === "queued";
    const ok = await confirm({
      title: paidNow ? "Leave the line and cancel?" : "Cancel this request?",
      message: paidNow
        ? `You haven't been seen, so your ${formatCurrency(request.priceCents)} payment will be refunded in full to your card (usually 5–10 business days).`
        : "You can always book a scheduled visit instead.",
      confirmLabel: "Cancel & refund",
      cancelLabel: "Keep waiting",
      destructive: true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const res = await authedFetch("/api/live/cancel", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: id }),
      });
      if (!res.ok) throw new Error();
      // Stay here: the snapshot flips to the cancelled screen with the refund.
    } catch {
      toast.error("Couldn't cancel", "Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  const serviceName = request ? SERVICE_MAP[request.serviceId]?.name : "";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[var(--primary-soft)] to-[var(--background)] px-4 py-10 text-center">
      {authLoading || resuming || loading || !request ? (
        <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
      ) : gated ? (
        <div className="w-full max-w-md text-left">
          <div className="mb-4 flex items-center justify-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Payment received
          </div>
          <FinishAccountCard
            title="Create your password & confirm your date of birth to continue"
            description="This takes a few seconds and keeps your spot. Once saved, your visit continues automatically — your nurse can be matched while you type."
            submitLabel="Save & continue to my visit"
          />
          <p className="mt-3 text-center text-xs text-[var(--muted-foreground)]">
            {request.status === "matched"
              ? "Your nurse is ready and waiting for you in the room."
              : "We're already looking for your nurse."}
          </p>
        </div>
      ) : request.status === "matched" ? (
        <>
          <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
          <p className="mt-4 text-[var(--muted-foreground)]">
            Connecting you to your nurse…
          </p>
          {request.appointmentId && (
            <Link
              href={`/visit/${request.appointmentId}?auto=1`}
              className="mt-4 text-sm text-[var(--primary)] underline"
            >
              Not redirected? Join your visit
            </Link>
          )}
        </>
      ) : request.status === "expired" ||
        request.status === "cancelled" ||
        request.status === "converted" ? (
        <ClosedScreen request={request} />
      ) : request.status === "pending_payment" ? (
        <>
          <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
          <p className="mt-4 text-[var(--muted-foreground)]">
            Confirming your payment…
          </p>
        </>
      ) : request.status === "queued" ? (
        <QueuedScreen
          request={request}
          now={now}
          serviceName={serviceName}
          stream={stream}
          mediaError={mediaError}
          cancelling={cancelling}
          onCancel={cancel}
          showScheduler={showScheduler}
          onToggleScheduler={() => setShowScheduler((s) => !s)}
        />
      ) : (
        // searching
        <div className="w-full max-w-sm">
          <span className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--primary)]/20" />
            <span className="absolute inset-3 animate-ping rounded-full bg-[var(--primary)]/30 [animation-delay:300ms]" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
              <Radar className="h-7 w-7" />
            </span>
          </span>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            {request.queuedProviderName
              ? `Connecting you to ${request.queuedProviderName.split(" ")[0]}`
              : "Looking for your live nurse"}
          </h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            {request.queuedProviderName ? (
              <>It&apos;s your turn — we&apos;re ringing your nurse now. Your video starts the moment they accept.</>
            ) : (
              <>
                Payment confirmed. We&apos;re connecting you with the first available
                nurse for your{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {serviceName}
                </span>{" "}
                visit. Hang tight — this is usually quick.
              </>
            )}
          </p>
          <span className="arx-rx-pill mt-3">
            <Pill className="h-3.5 w-3.5" /> Prescriptions go to our partner pharmacy, who ships to you
          </span>
          <SelfView stream={stream} error={mediaError} />
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Keep this tab open — your video starts on its own when your nurse accepts.
          </p>
          <button
            onClick={cancel}
            disabled={cancelling}
            className="mt-6 text-sm text-[var(--muted-foreground)] underline hover:text-[var(--accent)] disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel (full refund)"}
          </button>
        </div>
      )}
    </main>
  );
}

function QueuedScreen({
  request,
  now,
  serviceName,
  stream,
  mediaError,
  cancelling,
  onCancel,
  showScheduler,
  onToggleScheduler,
}: {
  request: LiveRequest;
  now: number;
  serviceName: string;
  stream: MediaStream | null;
  mediaError: string | null;
  cancelling: boolean;
  onCancel: () => void;
  showScheduler: boolean;
  onToggleScheduler: () => void;
}) {
  const position = request.position ?? 1;
  const nurseFirst = (request.queuedProviderName ?? "Your nurse").split(" ")[0];
  const estimateMs = (request.estimateAt ?? now) - now;
  const waitedMs = now - (request.queuedAt ?? request.createdAt);
  const visitEndsIn = request.currentVisitEndsAt ? request.currentVisitEndsAt - now : null;
  const longWait =
    estimateMs > SCHEDULE_INSTEAD_WAIT_MS || waitedMs > SCHEDULE_INSTEAD_WAIT_MS;
  const gatedByBooking =
    request.nextScheduledStart != null &&
    request.estimateAt != null &&
    request.estimateAt > now &&
    (visitEndsIn === null || visitEndsIn <= 0);

  return (
    <div className="w-full max-w-md">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
        <Users className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {position <= 1 ? "You're next" : `You're ${ordinal(position)} in line`}
      </h1>
      <p className="mt-1 text-lg text-[var(--foreground)]">
        {estimateMs <= 30_000 ? "Starting any moment" : aboutMinutes(estimateMs)}
        {request.estimateAt && estimateMs > 30_000 ? (
          <span className="text-[var(--muted-foreground)]">
            {" "}
            · around {formatTime(request.estimateAt)}
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        {nurseFirst} will take your{" "}
        <span className="font-medium text-[var(--foreground)]">{serviceName}</span>{" "}
        visit as soon as they&apos;re free. Your payment is confirmed and your spot is held.
      </p>

      {visitEndsIn !== null && visitEndsIn > 0 && (
        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--card)] px-4 py-2 text-sm shadow-sm">
          <Clock className="h-4 w-4 text-[var(--primary)]" />
          <span>
            {nurseFirst}&apos;s current visit ends in{" "}
            <span className="font-mono font-semibold">~{mmss(visitEndsIn)}</span>
          </span>
        </div>
      )}
      {gatedByBooking && request.nextScheduledStart && (
        <div className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--card)] px-4 py-2 text-sm shadow-sm">
          <CalendarClock className="h-4 w-4 text-[var(--primary)]" />
          <span>
            After {nurseFirst}&apos;s {formatTime(request.nextScheduledStart)} scheduled visit
          </span>
        </div>
      )}

      <div className="mt-3">
        <span className="arx-rx-pill">
          <Pill className="h-3.5 w-3.5" /> Prescriptions go to our partner pharmacy, who ships to you
        </span>
      </div>

      <SelfView stream={stream} error={mediaError} />
      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        Keep this tab open — your video starts on its own the moment {nurseFirst} is ready.
      </p>

      {longWait && request.queuedProviderId && (
        <Card className="mt-6 border-[#d4af37]/60 bg-[#fbf6e3] p-4 text-left">
          <p className="flex items-center gap-2 font-medium">
            <CalendarPlus className="h-4 w-4 text-[#9a7d18]" /> Rather not wait?
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Pick a scheduled time with {nurseFirst} instead. Your payment carries
            over and we refund{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {formatCurrency(SCHEDULE_INSTEAD_REFUND_CENTS)}
            </span>{" "}
            of the live premium — no new charge.
          </p>
          {showScheduler ? (
            <SlotPicker
              liveRequestId={request.id}
              providerId={request.queuedProviderId}
              serviceId={request.serviceId}
              onClose={onToggleScheduler}
            />
          ) : (
            <Button variant="outline" className="mt-3 w-full" onClick={onToggleScheduler}>
              <CalendarPlus className="h-4 w-4" /> Schedule instead
            </Button>
          )}
        </Card>
      )}

      <button
        onClick={onCancel}
        disabled={cancelling}
        className="mt-6 text-sm text-[var(--muted-foreground)] underline hover:text-[var(--accent)] disabled:opacity-50"
      >
        {cancelling ? "Cancelling…" : "Cancel (full refund)"}
      </button>
    </div>
  );
}

function SlotPicker({
  liveRequestId,
  providerId,
  serviceId,
  onClose,
}: {
  liveRequestId: string;
  providerId: string;
  serviceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [slots, setSlots] = React.useState<{ start: number; end: number }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState<number | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch(`/api/slots?providerId=${providerId}&serviceId=${serviceId}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setSlots((d.slots ?? []).slice(0, 24));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [providerId, serviceId]);

  async function pick(start: number) {
    setSubmitting(start);
    try {
      const res = await authedFetch("/api/live/schedule-instead", {
        method: "POST",
        body: JSON.stringify({ liveRequestId, providerId, start }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't schedule that time.");
      toast.success(
        "You're scheduled",
        `${formatCurrency(d.refundedCents ?? SCHEDULE_INSTEAD_REFUND_CENTS)} is on its way back to your card.`,
      );
      router.push(`/dashboard/appointments/${d.appointmentId}`);
    } catch (e) {
      toast.error("Couldn't schedule", e instanceof Error ? e.message : undefined);
      setSubmitting(null);
    }
  }

  const byDay = new Map<string, { start: number; end: number }[]>();
  for (const s of slots) {
    const k = formatDate(s.start);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }

  return (
    <div className="mt-3">
      {loading ? (
        <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-[var(--primary)]" />
      ) : slots.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No open times with this nurse right now — you can keep waiting or cancel for a full refund.
        </p>
      ) : (
        <div className="space-y-3">
          {Array.from(byDay.entries()).map(([day, daySlots]) => (
            <div key={day}>
              <p className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">{day}</p>
              <div className="flex flex-wrap gap-2">
                {daySlots.map((s) => (
                  <button
                    key={s.start}
                    disabled={submitting !== null}
                    onClick={() => pick(s.start)}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm transition-colors hover:border-[var(--primary)] disabled:opacity-50"
                  >
                    {submitting === s.start ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      formatTime(s.start)
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onClose}
        className="mt-3 text-xs text-[var(--muted-foreground)] underline"
      >
        Keep my place in line
      </button>
    </div>
  );
}

function ClosedScreen({ request }: { request: LiveRequest }) {
  const refunded = request.refundedCents ?? 0;
  const router = useRouter();

  if (request.status === "converted") {
    return (
      <div className="max-w-sm">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">You&apos;re scheduled</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          Your live request was converted to a scheduled visit.
          {refunded > 0 ? ` ${formatCurrency(refunded)} is being refunded to your card.` : ""}
        </p>
        {request.convertedAppointmentId && (
          <Button
            size="lg"
            className="mt-6"
            onClick={() => router.push(`/dashboard/appointments/${request.convertedAppointmentId}`)}
          >
            <Video className="h-4 w-4" /> View my visit
          </Button>
        )}
      </div>
    );
  }

  const expired = request.status === "expired";
  return (
    <div className="max-w-sm">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {expired ? "No nurse could take your visit" : "Live request cancelled"}
      </h1>
      <p className="mt-2 text-[var(--muted-foreground)]">
        {expired
          ? "Sorry about that — your nurse went offline before your turn. "
          : "No problem. "}
        {refunded > 0 ? (
          <>
            <span className="font-medium text-[var(--foreground)]">
              {formatCurrency(refunded)}
            </span>{" "}
            has been refunded to your card (usually 5–10 business days).
          </>
        ) : request.refundEligible ? (
          "Your payment will be refunded in full."
        ) : (
          "You weren't charged."
        )}
      </p>
      <Link href="/book" className="mt-6 inline-block">
        <Button size="lg">
          <CalendarPlus className="h-4 w-4" /> Schedule a visit
        </Button>
      </Link>
    </div>
  );
}
