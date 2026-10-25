"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAppointment } from "@/lib/hooks";
import { JOIN_EARLY_MS, windowState } from "@/lib/appointment-window";
import { formatTime, formatRelativeDay } from "@/lib/datetime";
import { consumeAutoJoin } from "@/lib/auto-join";
import { Lobby } from "@/components/visit/lobby";
import { VideoRoom } from "@/components/visit/video-room";
import { Button } from "@/components/ui/button";

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function VisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { appointment, loading } = useAppointment(id);
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  // Live patients arrive from /live/[id] with ?auto=1 (and a session flag):
  // skip the lobby and request the camera here. Read once, lazily, so this
  // page needs no Suspense boundary for search params.
  const [autoRequested] = React.useState(() => {
    if (typeof window === "undefined") return false;
    const fromQuery = new URLSearchParams(window.location.search).get("auto") === "1";
    return consumeAutoJoin(id) || fromQuery;
  });
  const [autoFailed, setAutoFailed] = React.useState(false);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/visit/${id}`)}`);
    }
  }, [authLoading, user, router, id]);

  // Tick so the "opens in" countdown flips to the lobby on its own.
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (authLoading || loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <Centered>
        <p>Visit not found.</p>
        <Link href="/dashboard">
          <Button variant="outline" className="mt-4">
            Back
          </Button>
        </Link>
      </Centered>
    );
  }

  const isProviderSide = appointment.providerId === user.uid;
  const isParticipant = appointment.clientId === user.uid || isProviderSide;
  if (!isParticipant) {
    return (
      <Centered>
        <p>You don&apos;t have access to this visit.</p>
      </Centered>
    );
  }

  const callRole = isProviderSide ? "provider" : "client";
  const backHref = isProviderSide
    ? "/provider/schedule"
    : `/dashboard/appointments/${id}`;
  const state = windowState(appointment, now);

  if (state === "future") {
    const opensAt = appointment.start - JOIN_EARLY_MS;
    return (
      <Centered>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/20 text-[var(--primary)]">
          <Clock className="h-5 w-5" />
        </span>
        <p className="mt-2 text-lg font-semibold">
          Your waiting room opens in {mmss(opensAt - now)}
        </p>
        <p className="max-w-sm text-center text-sm text-neutral-400">
          Visit is {formatRelativeDay(appointment.start)} at{" "}
          {formatTime(appointment.start)}. You can enter 5 minutes early — this
          page will open on its own.
        </p>
        <Link href={backHref}>
          <Button variant="outline" className="mt-4">
            Back
          </Button>
        </Link>
      </Centered>
    );
  }

  if (state === "ended" || state === "done") {
    return (
      <Centered>
        <p className="max-w-sm text-center">
          {state === "done"
            ? "This visit is closed."
            : "This visit window has ended."}
        </p>
        <Link href={backHref}>
          <Button variant="outline" className="mt-4">
            Back
          </Button>
        </Link>
      </Centered>
    );
  }

  if (!stream) {
    if (callRole === "client" && autoRequested && !autoFailed) {
      return (
        <AutoJoin
          onReady={setStream}
          onFail={() => setAutoFailed(true)}
        />
      );
    }
    return (
      <Lobby
        appointment={appointment}
        role={callRole}
        backHref={backHref}
        onEnter={setStream}
      />
    );
  }

  return (
    <VideoRoom appointment={appointment} role={callRole} initialStream={stream} />
  );
}

/**
 * No-click entry for live patients: grab the camera/mic (the browser already
 * remembered the grant from the live page's preview) and hand the stream to
 * the room. Any failure falls back to the regular lobby, which explains how
 * to fix permissions.
 */
function AutoJoin({
  onReady,
  onFail,
}: {
  onReady: (s: MediaStream) => void;
  onFail: () => void;
}) {
  React.useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        onReady(s);
      })
      .catch(() => {
        if (!cancelled) onFail();
      });
    return () => {
      cancelled = true;
    };
    // Run once on mount; callbacks are stable setState wrappers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Centered>
      <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      <p className="mt-2 text-sm text-neutral-300">Starting your camera…</p>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-950 px-4 text-white">
      {children}
    </div>
  );
}
