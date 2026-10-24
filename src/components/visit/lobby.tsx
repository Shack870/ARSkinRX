"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Loader2,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Pill,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserProfile } from "@/lib/hooks";
import { getService } from "@/lib/services";
import { formatTime, formatRelativeDay } from "@/lib/datetime";
import type { Appointment } from "@/lib/types";

type CallRole = "provider" | "client";

/**
 * Pre-join lobby: shows who you're meeting and when, previews the camera and
 * mic, and hands the live MediaStream to the room so there's one permission
 * prompt and no dead air between "Enter" and the waiting room.
 */
export function Lobby({
  appointment,
  role,
  backHref,
  onEnter,
}: {
  appointment: Appointment;
  role: CallRole;
  backHref: string;
  onEnter: (stream: MediaStream) => void;
}) {
  const otherUid =
    role === "provider" ? appointment.clientId : appointment.providerId;
  const { profile: other } = useUserProfile(otherUid);
  const service = getService(appointment.serviceId);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const handedOff = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [micOn, setMicOn] = React.useState(true);
  const [camOn, setCamOn] = React.useState(true);
  const [level, setLevel] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setReady(true);

        // Live mic level so the patient can see their mic is picking up.
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error &&
            (e.name === "NotAllowedError" || e.name === "NotFoundError")
            ? "We couldn't access your camera or microphone. Allow access in your browser's address bar, then reload."
            : "Couldn't start your camera. Close other apps using it and reload.",
        );
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
      // Only stop tracks if we didn't hand the stream to the room.
      if (!handedOff.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
    };
  }, []);

  function toggle(kind: "audio" | "video") {
    const s = streamRef.current;
    if (!s) return;
    const tracks = kind === "audio" ? s.getAudioTracks() : s.getVideoTracks();
    const next = !(tracks[0]?.enabled ?? true);
    tracks.forEach((t) => (t.enabled = next));
    if (kind === "audio") setMicOn(next);
    else setCamOn(next);
  }

  function enter() {
    const s = streamRef.current;
    if (!s) return;
    handedOff.current = true;
    onEnter(s);
  }

  const otherName =
    other?.displayName ?? (role === "provider" ? "your patient" : "your nurse");

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 lg:flex-row lg:items-center">
        {/* Preview */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-neutral-900 lg:flex-1">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${camOn ? "" : "opacity-0"}`}
            style={{ transform: "scaleX(-1)" }}
          />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
            </div>
          )}
          {!camOn && ready && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
              Camera off
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-300">
              {error}
            </div>
          )}
          {/* Mic meter */}
          {ready && (
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs">
              {micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5 text-red-400" />}
              <div className="flex h-3 w-16 items-end gap-0.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 rounded-sm transition-colors ${
                      micOn && level * 8 > i ? "bg-emerald-400" : "bg-neutral-600"
                    }`}
                    style={{ height: `${40 + i * 8}%` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button
              onClick={() => toggle("audio")}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${micOn ? "bg-neutral-700" : "bg-red-600"}`}
              aria-label="Toggle mic"
            >
              {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            <button
              onClick={() => toggle("video")}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${camOn ? "bg-neutral-700" : "bg-red-600"}`}
              aria-label="Toggle camera"
            >
              {camOn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="w-full lg:w-[380px]">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
            {role === "provider" ? "Your next visit" : "Ready for your visit?"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {service?.name ?? "Video visit"} with {otherName}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-neutral-300">
            <Clock className="h-4 w-4 text-neutral-400" />
            {formatRelativeDay(appointment.start)} · {formatTime(appointment.start)}
            –{formatTime(appointment.end)}
          </p>

          <ul className="mt-5 space-y-2 text-sm text-neutral-300">
            {role === "client" ? (
              <>
                <li>
                  You&apos;ll enter a private waiting room. {otherName} will
                  join you as soon as they&apos;re ready.
                </li>
                <li>
                  Your visit window is held open until{" "}
                  <strong className="text-white">{formatTime(appointment.end)}</strong>.
                  Missed visits aren&apos;t refunded.
                </li>
                <li className="flex items-start gap-2">
                  <Pill className="mt-0.5 h-4 w-4 shrink-0 text-[#d6a73a]" />
                  <span>
                    If a prescription is part of your plan, it&apos;s included —
                    your nurse sends it to your pharmacy.
                  </span>
                </li>
              </>
            ) : (
              <>
                <li>
                  You&apos;ll see when {otherName} is in the waiting room, and the
                  call connects automatically when you both arrive.
                </li>
                <li>
                  Hold the window open until{" "}
                  <strong className="text-white">{formatTime(appointment.end)}</strong>.
                  If the patient never arrives you can close it out as a no-show
                  from the room.
                </li>
              </>
            )}
          </ul>

          <Button
            size="lg"
            className="mt-6 w-full"
            onClick={enter}
            disabled={!ready}
          >
            <VideoIcon className="h-4 w-4" />
            {role === "provider" ? "Enter the room" : "Enter waiting room"}
          </Button>
          {!ready && !error && (
            <p className="mt-2 text-center text-xs text-neutral-500">
              Waiting for camera permission…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
