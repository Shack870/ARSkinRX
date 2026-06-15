"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { authedFetch } from "@/lib/api-client";
import { useIntake } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { ProviderVisitPanel } from "@/components/visit/provider-visit-panel";
import type { Appointment, Role } from "@/lib/types";

type CallRole = "provider" | "client";
type Status = "connecting" | "waiting" | "connected" | "error" | "ended";

export function VideoRoom({
  appointment,
  role,
}: {
  appointment: Appointment;
  role: Role;
}) {
  const router = useRouter();
  const callRole: CallRole = role === "provider" ? "provider" : "client";
  const { intake } = useIntake(
    callRole === "provider" ? appointment.intakeId : undefined,
  );

  const localRef = React.useRef<HTMLVideoElement>(null);
  const remoteRef = React.useRef<HTMLVideoElement>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const unsubsRef = React.useRef<Array<() => void>>([]);

  const [status, setStatus] = React.useState<Status>("connecting");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [micOn, setMicOn] = React.useState(true);
  const [camOn, setCamOn] = React.useState(true);

  const cleanup = React.useCallback(() => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await authedFetch(`/api/appointments/${appointment.id}/join`, {
          method: "POST",
        });
        const ice = await fetch("/api/turn").then((r) => r.json());
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = localStream;
        if (localRef.current) localRef.current.srcObject = localStream;

        const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
        pcRef.current = pc;
        const remoteStream = new MediaStream();
        if (remoteRef.current) remoteRef.current.srcObject = remoteStream;

        localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
        pc.ontrack = (e) => {
          e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
          setStatus("connected");
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") setStatus("connected");
          if (
            pc.connectionState === "disconnected" ||
            pc.connectionState === "failed"
          ) {
            setStatus((s) => (s === "ended" ? s : "waiting"));
          }
        };

        const callDoc = doc(db, COLLECTIONS.signaling, appointment.id);
        const offerCandidates = collection(callDoc, "offerCandidates");
        const answerCandidates = collection(callDoc, "answerCandidates");

        if (callRole === "provider") {
          pc.onicecandidate = (e) => {
            if (e.candidate) addDoc(offerCandidates, e.candidate.toJSON());
          };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setDoc(
            callDoc,
            { offer: { sdp: offer.sdp, type: offer.type }, createdAt: Date.now() },
            { merge: true },
          );
          setStatus("waiting");
          unsubsRef.current.push(
            onSnapshot(callDoc, (snap) => {
              const data = snap.data();
              if (data?.answer && pc.currentRemoteDescription === null) {
                pc.setRemoteDescription(new RTCSessionDescription(data.answer));
              }
            }),
          );
          unsubsRef.current.push(
            onSnapshot(answerCandidates, (snap) => {
              snap.docChanges().forEach((c) => {
                if (c.type === "added")
                  pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(
                    () => {},
                  );
              });
            }),
          );
        } else {
          pc.onicecandidate = (e) => {
            if (e.candidate) addDoc(answerCandidates, e.candidate.toJSON());
          };
          setStatus("waiting");
          unsubsRef.current.push(
            onSnapshot(callDoc, async (snap) => {
              const data = snap.data();
              if (data?.offer && !pc.currentRemoteDescription) {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(data.offer),
                );
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await updateDoc(callDoc, {
                  answer: { sdp: answer.sdp, type: answer.type },
                });
              }
            }),
          );
          unsubsRef.current.push(
            onSnapshot(offerCandidates, (snap) => {
              snap.docChanges().forEach((c) => {
                if (c.type === "added")
                  pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(
                    () => {},
                  );
              });
            }),
          );
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(
          e instanceof Error && (e.name === "NotAllowedError" || e.message.includes("Permission"))
            ? "Camera/microphone access was blocked. Please allow access and reload."
            : "Could not start the visit.",
        );
      }
    }
    init();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.id, callRole]);

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  }
  function toggleCam() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  }

  // Disconnect video but stay on the page (provider keeps writing notes).
  function hangUp() {
    cleanup();
    setStatus("ended");
  }

  // Patient leaves entirely.
  function leave() {
    cleanup();
    router.push(`/dashboard/appointments/${appointment.id}`);
  }

  const callEnded = status === "ended";

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
          {status !== "connected" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/85 text-white">
              {status === "error" ? (
                <p className="max-w-sm px-6 text-center text-sm text-red-300">
                  {errorMsg}
                </p>
              ) : status === "ended" ? (
                <>
                  <PhoneOff className="h-8 w-8 text-neutral-400" />
                  <p className="text-sm text-neutral-300">Call ended</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                  <p className="text-sm text-neutral-300">
                    {status === "waiting"
                      ? callRole === "provider"
                        ? "Waiting for your patient to join…"
                        : "Connecting you with your provider…"
                      : "Starting your visit…"}
                  </p>
                </>
              )}
            </div>
          )}
          {!callEnded && (
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 h-32 w-24 rounded-lg border border-white/20 object-cover shadow-lg sm:h-40 sm:w-32"
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
              <Button variant="accent" onClick={hangUp} className="rounded-full">
                <PhoneOff className="h-5 w-5" /> End call
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Provider clinical panel */}
      {callRole === "provider" && (
        <aside className="w-full border-t border-[var(--border)] lg:h-screen lg:w-[420px] lg:overflow-hidden lg:border-l lg:border-t-0">
          <ProviderVisitPanel
            appointment={appointment}
            intake={intake}
            callEnded={callEnded}
            onEndCall={hangUp}
            onCompleted={() => {
              cleanup();
              router.push("/provider/schedule");
            }}
          />
        </aside>
      )}
    </div>
  );
}
