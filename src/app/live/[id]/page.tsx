"use client";

import * as React from "react";
import { Suspense, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Radar, CalendarPlus, AlertTriangle, Video, Pill } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLiveRequest } from "@/lib/hooks";
import { authedFetch } from "@/lib/api-client";
import { SERVICE_MAP } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { FinishAccountCard } from "@/components/finish-account-card";
import { usePaymentResume } from "@/lib/use-payment-resume";

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

function LiveInner({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();
  const { request, loading } = useLiveRequest(id);
  const verifiedRef = React.useRef(false);
  const [cancelling, setCancelling] = React.useState(false);
  // Guest who paid but has no session here (other origin/device): resume
  // from the paid Stripe session before falling back to login.
  const resuming = usePaymentResume();
  const needsPassword = profile?.passwordSet === false;

  React.useEffect(() => {
    if (!authLoading && !resuming && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/live/${id}`)}`);
    }
  }, [authLoading, resuming, user, router, id]);

  // Verify payment on return from Stripe.
  React.useEffect(() => {
    const sessionId = search.get("session_id");
    if (
      search.get("paid") === "1" &&
      sessionId &&
      request?.status === "pending_payment" &&
      !verifiedRef.current
    ) {
      verifiedRef.current = true;
      authedFetch("/api/live/verify", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: id, sessionId }),
      }).catch(() => {});
    }
  }, [search, request?.status, id]);

  // While searching, nudge the matcher every few seconds.
  React.useEffect(() => {
    if (request?.status !== "searching") return;
    const tick = () =>
      authedFetch("/api/live/match", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: id }),
      }).catch(() => {});
    tick();
    const interval = setInterval(tick, 4000);
    return () => clearInterval(interval);
  }, [request?.status, id]);

  // Redirect into the visit once matched — unless this is a brand-new guest
  // mid-way through setting a password; then we show a Join button instead so
  // the redirect doesn't yank the form away.
  React.useEffect(() => {
    if (request?.status === "matched" && request.appointmentId && !needsPassword) {
      router.replace(`/visit/${request.appointmentId}`);
    }
  }, [request?.status, request?.appointmentId, needsPassword, router]);

  async function cancel() {
    setCancelling(true);
    try {
      await authedFetch("/api/live/cancel", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: id }),
      });
      router.push("/book");
    } catch {
      setCancelling(false);
    }
  }

  const serviceName = request ? SERVICE_MAP[request.serviceId]?.name : "";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[var(--primary-soft)] to-[var(--background)] px-4 text-center">
      {authLoading || resuming || loading || !request ? (
        <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
      ) : request.status === "matched" ? (
        needsPassword && request.appointmentId ? (
          <div className="w-full max-w-md">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Video className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">
              Your nurse is ready for you
            </h1>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Join now — your nurse is waiting in the room.
            </p>
            <Link href={`/visit/${request.appointmentId}`} className="mt-5 inline-block w-full">
              <Button size="lg" className="w-full">
                <Video className="h-4 w-4" /> Join video visit
              </Button>
            </Link>
            <div className="mt-6 text-left">
              <FinishAccountCard />
            </div>
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              You can set your password after the visit instead — it&apos;ll be
              waiting on your dashboard.
            </p>
          </div>
        ) : (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
            <p className="mt-4 text-[var(--muted-foreground)]">
              Connecting you to your nurse…
            </p>
          </>
        )
      ) : request.status === "expired" || request.status === "cancelled" ? (
        <div className="max-w-sm">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            <AlertTriangle className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {request.status === "expired"
              ? "No nurse connected in time"
              : "Live request cancelled"}
          </h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Sorry about that — let&apos;s get you scheduled instead. If you were
            charged, you&apos;re eligible for a refund.
          </p>
          <Link href="/book" className="mt-6 inline-block">
            <Button size="lg">
              <CalendarPlus className="h-4 w-4" /> Schedule a visit
            </Button>
          </Link>
        </div>
      ) : request.status === "pending_payment" ? (
        <>
          <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
          <p className="mt-4 text-[var(--muted-foreground)]">
            Confirming your payment…
          </p>
        </>
      ) : (
        // searching
        <div className="max-w-sm">
          <span className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--primary)]/20" />
            <span className="absolute inset-3 animate-ping rounded-full bg-[var(--primary)]/30 [animation-delay:300ms]" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
              <Radar className="h-7 w-7" />
            </span>
          </span>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Looking for your live nurse
          </h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Payment confirmed. We&apos;re connecting you with the first available
            nurse for your{" "}
            <span className="font-medium text-[var(--foreground)]">
              {serviceName}
            </span>{" "}
            visit. Hang tight — this is usually quick.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <Pill className="h-3.5 w-3.5 text-[var(--tint-gold-fg)]" />
            Prescription included in your visit price
          </p>
          {needsPassword && (
            <div className="mt-6 text-left">
              <p className="mb-2 text-sm font-medium">
                While you wait — finish your account
              </p>
              <FinishAccountCard />
            </div>
          )}
          <button
            onClick={cancel}
            disabled={cancelling}
            className="mt-6 text-sm text-[var(--muted-foreground)] underline hover:text-[var(--accent)] disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel and schedule instead"}
          </button>
        </div>
      )}
    </main>
  );
}
