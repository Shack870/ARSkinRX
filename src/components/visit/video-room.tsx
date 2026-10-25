"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  UserCheck,
  UserX,
  Users,
  Video as VideoIcon,
  VideoOff,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { authedFetch } from "@/lib/api-client";
import { useIntake, useUserProfile } from "@/lib/hooks";
import { formatTime } from "@/lib/datetime";
import { SCHEDULED_LATE_MS } from "@/lib/live-queue-math";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { ProviderVisitPanel } from "@/components/visit/provider-visit-panel";
import { QueueStrip, useLiveQueue } from "@/components/live/queue-strip";
import type { Appointment, Role } from "@/lib/types";

/** While a nurse is in a room, keep her live-presence heartbeat fresh. */
const PRESENCE_BEAT_MS = 20_000;

type CallRole = "provider" | "client";
type Status = "waiting" | "connected" | "error" | "ended";

/** Heartbeat cadence and how stale a heartbeat can be before "not here". */
const HEARTBEAT_MS = 10_000;
const PRESENCE_TTL_MS = 25_000;

type SignalDoc = {
  sessionId?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  renegotiateAt?: number;
  presence?: { client?: number; provider?: number };
};

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Short two-tone chime so the nurse hears the patient arrive. */
function chime() {
  try {
    const ctx = new AudioContext();
    [[880, 0], [1175, 0.18]].forEach(([f, t]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    /* audio is best-effort */
  }
}

/**
 * Two-party WebRTC room with a real waiting room.
 *
 * Signaling lives at signaling/{appointmentId}. The provider owns the offer and
 * starts a fresh *session* (new sessionId, new peer connection, candidates under
 * sessions/{sessionId}/…) every time it mounts or the connection fails, and
 * whenever the patient asks for one by bumping `renegotiateAt`. That makes tab
 * reloads on either side safe during a long wait. Both sides heartbeat
 * `presence.{role}` so each can see whether the other is actually in the room.
 */
export function VideoRoom({
  appointment,
  role,
  initialStream,
}: {
  appointment: Appointment;
  role: Role;
  initialStream: MediaStream;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const callRole: CallRole = role === "provider" ? "provider" : "client";
  const peerRole: CallRole = callRole === "provider" ? "client" : "provider";
  const { intake } = useIntake(
    callRole === "provider" ? appointment.intakeId : undefined,
  );
  const { profile: peer } = useUserProfile(
    callRole === "provider" ? appointment.clientId : appointment.providerId,
  );
  const peerName =
    peer?.displayName ?? (callRole === "provider" ? "your patient" : "your nurse");

  const localRef = React.useRef<HTMLVideoElement>(null);
  const remoteRef = React.useRef<HTMLVideoElement>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream>(initialStream);
  const docUnsubRef = React.useRef<(() => void) | null>(null);
  const sessionUnsubsRef = React.useRef<Array<() => void>>([]);
  const sessionIdRef = React.useRef<string | null>(null);
  /** Last `renegotiateAt` the provider acted on (or saw at mount). */
  const handledRenegotiateRef = React.useRef<number | null>(null);
  const pendingIceRef = React.useRef<RTCIceCandidateInit[]>([]);
  const endedRef = React.useRef(false);

  const [status, setStatus] = React.useState<Status>("waiting");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [micOn, setMicOn] = React.useState(
    () => initialStream.getAudioTracks()[0]?.enabled ?? true,
  );
  const [camOn, setCamOn] = React.useState(
    () => initialStream.getVideoTracks()[0]?.enabled ?? true,
  );
  const [now, setNow] = React.useState(() => Date.now());
  const [peerLastSeen, setPeerLastSeen] = React.useState(0);
  const [closingOut, setClosingOut] = React.useState(false);
  const [startingNext, setStartingNext] = React.useState(false);
  /** The panel's End Appointment flow, so the control bar can trigger it. */
  const completeRef = React.useRef<(() => Promise<void>) | null>(null);
  const registerComplete = React.useCallback((fn: () => Promise<void>) => {
    completeRef.current = fn;
  }, []);
  const queue = useLiveQueue(callRole === "provider");

  const callDoc = React.useMemo(
    () => doc(db, COLLECTIONS.signaling, appointment.id),
    [appointment.id],
  );

  // Nurse: stay fresh in the live pool while in the room (patients queue
  // behind this visit). Only touches lastSeenAt — never flips online/busy.
  React.useEffect(() => {
    if (callRole !== "provider") return;
    const ref = doc(db, COLLECTIONS.presence, appointment.providerId);
    const beat = () =>
      setDoc(ref, { lastSeenAt: Date.now() }, { merge: true }).catch(() => {});
    beat();
    const t = setInterval(beat, PRESENCE_BEAT_MS);
    return () => clearInterval(t);
  }, [callRole, appointment.providerId]);

  const peerPresent = now - peerLastSeen < PRESENCE_TTL_MS;
  const windowLeft = appointment.end - now;
  const windowOver = windowLeft <= 0;

  // ── Peer connection helpers ────────────────────────────────────────────
  const teardownSession = React.useCallback(() => {
    sessionUnsubsRef.current.forEach((u) => u());
    sessionUnsubsRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    pendingIceRef.current = [];
  }, []);

  const buildPeer = React.useCallback(
    async (candidatesOut: ReturnType<typeof collection>) => {
      const ice = await fetch("/api/turn").then((r) => r.json());
      const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
      const remoteStream = new MediaStream();
      if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
      localStreamRef.current
        .getTracks()
        .forEach((t) => pc.addTrack(t, localStreamRef.current));
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
        if (!endedRef.current) setStatus("connected");
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) addDoc(candidatesOut, e.candidate.toJSON());
      };
      return pc;
    },
    [],
  );

  const applyIce = React.useCallback((pc: RTCPeerConnection, c: RTCIceCandidateInit) => {
    if (pc.remoteDescription) {
      pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    } else {
      pendingIceRef.current.push(c);
    }
  }, []);
  const flushIce = React.useCallback((pc: RTCPeerConnection) => {
    pendingIceRef.current.splice(0).forEach((c) =>
      pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}),
    );
  }, []);

  const listenCandidates = React.useCallback(
    (pc: RTCPeerConnection, sid: string, name: "offerCandidates" | "answerCandidates") => {
      const col = collection(callDoc, "sessions", sid, name);
      sessionUnsubsRef.current.push(
        onSnapshot(col, (snap) => {
          snap.docChanges().forEach((c) => {
            if (c.type === "added") applyIce(pc, c.doc.data() as RTCIceCandidateInit);
          });
        }),
      );
    },
    [callDoc, applyIce],
  );

  // Provider: start (or restart) a session with a fresh offer. Restarts from
  // inside pc callbacks go through a ref so the callback can reference itself.
  const restartRef = React.useRef<() => void>(() => {});
  const startProviderSession = React.useCallback(async () => {
    teardownSession();
    const sid = crypto.randomUUID();
    sessionIdRef.current = sid;
    const pc = await buildPeer(collection(callDoc, "sessions", sid, "offerCandidates"));
    pcRef.current = pc;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && !endedRef.current) {
        setStatus("waiting");
        restartRef.current();
      } else if (pc.connectionState === "disconnected" && !endedRef.current) {
        setStatus("waiting");
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(
      callDoc,
      {
        sessionId: sid,
        offer: { sdp: offer.sdp, type: offer.type },
        answer: deleteField(),
        offerAt: Date.now(),
      },
      { merge: true },
    );
    listenCandidates(pc, sid, "answerCandidates");
  }, [buildPeer, callDoc, listenCandidates, teardownSession]);
  React.useEffect(() => {
    restartRef.current = () => {
      startProviderSession().catch(() => {});
    };
  }, [startProviderSession]);

  // Client: answer a specific session.
  const answerSession = React.useCallback(
    async (sid: string, offer: RTCSessionDescriptionInit) => {
      teardownSession();
      sessionIdRef.current = sid;
      const pc = await buildPeer(collection(callDoc, "sessions", sid, "answerCandidates"));
      pcRef.current = pc;
      pc.onconnectionstatechange = () => {
        if (endedRef.current) return;
        if (pc.connectionState === "failed") {
          setStatus("waiting");
          updateDoc(callDoc, { renegotiateAt: Date.now() }).catch(() => {});
        } else if (pc.connectionState === "disconnected") {
          setStatus("waiting");
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      flushIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(callDoc, {
        answer: { sdp: answer.sdp, type: answer.type },
      });
      listenCandidates(pc, sid, "offerCandidates");
    },
    [buildPeer, callDoc, flushIce, listenCandidates, teardownSession],
  );

  // ── Mount: join, heartbeat, signaling subscription ─────────────────────
  React.useEffect(() => {
    endedRef.current = false;
    if (localRef.current) localRef.current.srcObject = localStreamRef.current;

    let cancelled = false;
    const stream = localStreamRef.current;

    const beat = () =>
      setDoc(
        callDoc,
        { presence: { [callRole]: Date.now() } },
        { merge: true },
      ).catch(() => {});
    beat();
    const hb = setInterval(beat, HEARTBEAT_MS);

    (async () => {
      try {
        const res = await authedFetch(`/api/appointments/${appointment.id}/join`, {
          method: "POST",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Could not join the visit.");
        }
        if (cancelled) return;

        if (callRole === "provider") {
          await startProviderSession();
        }

        docUnsubRef.current = onSnapshot(callDoc, (snap) => {
          if (cancelled || endedRef.current) return;
          const data = (snap.data() ?? {}) as SignalDoc;
          const seen = data.presence?.[peerRole] ?? 0;
          setPeerLastSeen(seen);

          if (callRole === "provider") {
            const pc = pcRef.current;
            if (
              pc &&
              data.sessionId === sessionIdRef.current &&
              data.answer &&
              !pc.currentRemoteDescription
            ) {
              pc.setRemoteDescription(new RTCSessionDescription(data.answer))
                .then(() => flushIce(pc))
                .catch(() => {});
            }
            // A renegotiate request is "new" only if it differs from the one
            // we last handled; the value present at mount is treated as stale.
            const rq = data.renegotiateAt ?? 0;
            if (handledRenegotiateRef.current === null) {
              handledRenegotiateRef.current = rq;
            } else if (rq !== handledRenegotiateRef.current) {
              handledRenegotiateRef.current = rq;
              startProviderSession().catch(() => {});
            }
          } else {
            if (!data.sessionId || !data.offer) return;
            if (data.sessionId === sessionIdRef.current) return;
            if (data.answer) {
              // Someone (an earlier tab of ours) already answered this session;
              // ask the provider for a fresh offer rather than double-answer.
              sessionIdRef.current = data.sessionId;
              updateDoc(callDoc, { renegotiateAt: Date.now() }).catch(() => {});
              return;
            }
            answerSession(data.sessionId, data.offer).catch(() => {});
          }
        });
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "Could not start the visit.");
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(hb);
      docUnsubRef.current?.();
      docUnsubRef.current = null;
      teardownSession();
      stream.getTracks().forEach((t) => t.stop());
      setDoc(callDoc, { presence: { [callRole]: 0 } }, { merge: true }).catch(
        () => {},
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.id, callRole]);

  // Clock tick for the window countdown and presence TTL.
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Chime for the nurse when the patient arrives in the waiting room.
  const wasPresentRef = React.useRef(false);
  React.useEffect(() => {
    if (callRole === "provider" && peerPresent && !wasPresentRef.current) {
      chime();
    }
    wasPresentRef.current = peerPresent;
  }, [peerPresent, callRole]);

  // If the visit gets closed (completed / no-show / cancelled) while the
  // patient is in the room, tear down the media. The "ended" UI is derived
  // from the appointment status below, so no state write is needed here.
  const visitClosed =
    callRole === "client" &&
    ["completed", "cancelled", "no_show"].includes(appointment.status);
  React.useEffect(() => {
    if (!visitClosed) return;
    endedRef.current = true;
    teardownSession();
  }, [visitClosed, teardownSession]);

  // ── Controls ──────────────────────────────────────────────────────────
  function toggleMic() {
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  }
  function toggleCam() {
    const track = localStreamRef.current.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  }

  // Provider: disconnect video but stay on the page to finish notes.
  function hangUp() {
    endedRef.current = true;
    docUnsubRef.current?.();
    docUnsubRef.current = null;
    teardownSession();
    localStreamRef.current.getTracks().forEach((t) => t.stop());
    setDoc(callDoc, { presence: { [callRole]: 0 } }, { merge: true }).catch(() => {});
    setStatus("ended");
  }

  // Patient leaves entirely.
  function leave() {
    endedRef.current = true;
    teardownSession();
    router.push(`/dashboard/appointments/${appointment.id}`);
  }

  async function markNoShow() {
    const ok = await confirm({
      title: "Mark patient as no-show?",
      message: `${peerName} never joined and the visit window has ended. This closes the visit; the booking isn't refunded and the patient can reschedule once for free.`,
      confirmLabel: "Mark no-show",
      destructive: true,
    });
    if (!ok) return;
    setClosingOut(true);
    try {
      const res = await authedFetch(`/api/appointments/${appointment.id}/no-show`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't mark the no-show.");
      }
      toast.success("Visit closed as a no-show.");
      hangUp();
      router.push("/provider/schedule");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't mark the no-show.");
      setClosingOut(false);
    }
  }

  /** Nurse: a scheduled patient is 5+ min late and someone's waiting in line. */
  async function startNextLive() {
    const ok = await confirm({
      title: "Start the next live visit?",
      message: `${peerName} hasn't arrived. The next paid patient in your line will be connected to you now; this scheduled window stays open until ${formatTime(appointment.end)} so you can still close it out afterwards.`,
      confirmLabel: "Start next live visit",
    });
    if (!ok) return;
    setStartingNext(true);
    try {
      const res = await authedFetch("/api/live/pop-next", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.appointmentId) {
        throw new Error(j.error || "Couldn't start the next visit.");
      }
      hangUp();
      router.push(`/visit/${j.appointmentId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the next visit.");
      setStartingNext(false);
    }
  }

  const callEnded = status === "ended" || visitClosed;
  const patientEverJoined = !!appointment.joinedAt?.client;
  const canMarkNoShow =
    callRole === "provider" &&
    status === "waiting" &&
    !peerPresent &&
    !patientEverJoined &&
    windowLeft <= 60_000;
  const canStartNext =
    callRole === "provider" &&
    status === "waiting" &&
    !appointment.isLive &&
    !peerPresent &&
    now >= appointment.start + SCHEDULED_LATE_MS &&
    (queue?.count ?? 0) > 0;

  // ── Waiting-room overlay copy ─────────────────────────────────────────
  function waitingCopy() {
    if (callRole === "provider") {
      if (peerPresent)
        return {
          title: `${peerName} is here`,
          body: "Connecting your video now…",
          tone: "ready" as const,
        };
      if (windowOver)
        return {
          title: `${peerName} didn't arrive`,
          body: "The visit window has ended. You can close this out as a no-show.",
          tone: "late" as const,
        };
      return {
        title: `Waiting for ${peerName}`,
        body: "They'll see that you're in the room. The call connects automatically when they arrive.",
        tone: "wait" as const,
      };
    }
    if (peerPresent)
      return {
        title: `${peerName} is here`,
        body: "Connecting your video now…",
        tone: "ready" as const,
      };
    if (windowOver)
      return {
        title: "Your nurse wasn't able to connect",
        body: "We're sorry. We'll note this on your visit and you can reschedule at no charge from your dashboard.",
        tone: "late" as const,
      };
    return {
      title: "You're in the waiting room",
      body: `${peerName} will be with you shortly. Keep this tab open — your video will start automatically.`,
      tone: "wait" as const,
    };
  }
  const effStatus: Status = callEnded ? "ended" : status;
  const wc = effStatus === "waiting" ? waitingCopy() : null;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 lg:flex-row">
      {/* Video column */}
      <div className="relative flex min-h-[42vh] flex-1 flex-col lg:min-h-screen">
        <div className="relative flex-1">
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            className="h-full w-full bg-neutral-900 object-cover"
          />

          {/* Window clock + presence chip (always visible while live) */}
          {!callEnded && effStatus !== "error" && (
            <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium backdrop-blur ${
                  windowOver
                    ? "bg-red-500/80 text-white"
                    : windowLeft < 3 * 60_000
                      ? "bg-amber-400/90 text-amber-950"
                      : "bg-black/50 text-white"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                {windowOver
                  ? "Window ended"
                  : `${mmss(windowLeft)} left · until ${formatTime(appointment.end)}`}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium backdrop-blur ${
                  peerPresent
                    ? "bg-emerald-500/80 text-white"
                    : "bg-black/50 text-neutral-300"
                }`}
              >
                {peerPresent ? (
                  <UserCheck className="h-3.5 w-3.5" />
                ) : (
                  <UserX className="h-3.5 w-3.5" />
                )}
                {peerPresent ? `${peerName} is in the room` : `${peerName} hasn't arrived`}
              </span>
            </div>
          )}

          {effStatus !== "connected" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/90 px-6 text-center text-white">
              {effStatus === "error" ? (
                <p className="max-w-sm text-sm text-red-300">{errorMsg}</p>
              ) : effStatus === "ended" ? (
                <>
                  <PhoneOff className="h-8 w-8 text-neutral-400" />
                  <p className="text-sm text-neutral-300">Your visit has ended</p>
                  {callRole === "client" && (
                    <Button
                      className="mt-2"
                      onClick={() =>
                        router.push(`/dashboard/appointments/${appointment.id}`)
                      }
                    >
                      View visit summary
                    </Button>
                  )}
                </>
              ) : (
                wc && (
                  <>
                    {wc.tone === "late" ? (
                      <UserX className="h-9 w-9 text-amber-300" />
                    ) : wc.tone === "ready" ? (
                      <Loader2 className="h-9 w-9 animate-spin text-emerald-400" />
                    ) : (
                      <span className="relative flex h-12 w-12 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-30" />
                        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]">
                          <Clock className="h-4 w-4" />
                        </span>
                      </span>
                    )}
                    <p className="text-lg font-semibold">{wc.title}</p>
                    <p className="max-w-sm text-sm text-neutral-300">{wc.body}</p>
                    {!windowOver && wc.tone === "wait" && (
                      <p className="text-xs text-neutral-500">
                        Visit window held open until {formatTime(appointment.end)}
                      </p>
                    )}
                    {canStartNext && (
                      <Button
                        className="mt-2"
                        onClick={startNextLive}
                        disabled={startingNext}
                      >
                        {startingNext ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Users className="h-4 w-4" />
                        )}
                        Start next live visit ({queue?.count} waiting)
                      </Button>
                    )}
                    {canMarkNoShow && (
                      <Button
                        variant="accent"
                        className="mt-2"
                        onClick={markNoShow}
                        disabled={closingOut}
                      >
                        {closingOut && <Loader2 className="h-4 w-4 animate-spin" />}
                        Mark no-show & close visit
                      </Button>
                    )}
                    {callRole === "client" && windowOver && (
                      <Button className="mt-2" onClick={leave}>
                        Back to my dashboard
                      </Button>
                    )}
                  </>
                )
              )}
            </div>
          )}

          {!callEnded && (
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className={`absolute bottom-4 right-4 h-32 w-24 rounded-lg border border-white/20 bg-neutral-800 object-cover shadow-lg sm:h-40 sm:w-32 ${camOn ? "" : "opacity-40"}`}
              style={{ transform: "scaleX(-1)" }}
            />
          )}
        </div>

        {/* Controls */}
        {!callEnded && (
          <div className="flex items-center justify-center gap-3 bg-neutral-900 p-4">
            <button
              onClick={toggleMic}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${micOn ? "bg-neutral-700" : "bg-red-600"}`}
              aria-label="Toggle mic"
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              onClick={toggleCam}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${camOn ? "bg-neutral-700" : "bg-red-600"}`}
              aria-label="Toggle camera"
            >
              {camOn ? (
                <VideoIcon className="h-5 w-5" />
              ) : (
                <VideoOff className="h-5 w-5" />
              )}
            </button>
            {callRole === "client" && (
              <Button variant="accent" onClick={leave} className="rounded-full">
                <PhoneOff className="h-5 w-5" /> Leave
              </Button>
            )}
            {callRole === "provider" && (
              <Button
                variant="accent"
                onClick={() => completeRef.current?.()}
                className="rounded-full"
              >
                <CheckCircle2 className="h-5 w-5" /> End Appointment
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Provider clinical panel */}
      {callRole === "provider" && (
        <aside className="flex w-full flex-col border-t border-[var(--border)] lg:h-screen lg:w-[420px] lg:overflow-hidden lg:border-l lg:border-t-0">
          <QueueStrip view={queue} compact className="rounded-none border-x-0 border-t-0" />
          <div className="min-h-0 flex-1">
            <ProviderVisitPanel
              appointment={appointment}
              intake={intake}
              callEnded={callEnded}
              onEndCall={hangUp}
              onRegisterComplete={registerComplete}
              onCompleted={() => {
                hangUp();
                // Back to the overview: the queue strip + the next-in-line
                // offer modal live there, and the nurse is still "live".
                router.push("/provider");
              }}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
