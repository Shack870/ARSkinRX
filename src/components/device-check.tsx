"use client";

import * as React from "react";
import { Mic, Video as VideoIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Lightweight pre-visit device check: previews the camera and shows a live mic
 * level so patients can confirm their setup before joining.
 */
export function DeviceCheck() {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [level, setLevel] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);

  const stop = React.useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  React.useEffect(() => () => stop(), [stop]);

  async function start() {
    setError(null);
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, Math.round((avg / 140) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setError(
        "We couldn't access your camera or microphone. Check your browser permissions.",
      );
    }
  }

  function close() {
    stop();
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={start}>
        <VideoIcon className="h-4 w-4" /> Test camera &amp; mic
      </Button>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">Device check</p>
        <button onClick={close} aria-label="Close" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error ? (
        <p className="text-sm text-[var(--accent)]">{error}</p>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-video w-full rounded-[var(--radius-sm)] bg-neutral-900 object-cover"
          />
          <div className="mt-3 flex items-center gap-2">
            <Mic className="h-4 w-4 text-[var(--primary)]" />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full bg-[var(--primary)] transition-all"
                style={{ width: `${level}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Speak to see the bar move. If you see yourself and the bar reacts,
            you&apos;re all set.
          </p>
        </>
      )}
    </div>
  );
}
