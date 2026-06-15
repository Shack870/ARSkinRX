"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PhoneIncoming, Zap } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { usePresence } from "@/components/live/presence-context";
import { useToast } from "@/components/ui/toast";
import { SERVICE_MAP } from "@/lib/services";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ServiceType } from "@/lib/types";

interface Offer {
  id: string;
  serviceId: ServiceType;
  priceCents: number;
  offerExpiresAt: number;
}

/** Plays a short two-tone bell (no audio asset needed). */
function playBell() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const beep = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + start + dur,
      );
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    beep(880, 0, 0.18);
    beep(1175, 0.2, 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    // audio not available — non-fatal
  }
}

export function LiveOffers() {
  const router = useRouter();
  const toast = useToast();
  const { online, busy } = usePresence();
  const [offer, setOffer] = React.useState<Offer | null>(null);
  const [working, setWorking] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const lastIdRef = React.useRef<string | null>(null);

  // Poll for the request currently offered to me.
  React.useEffect(() => {
    if (!online || busy) {
      setOffer(null);
      lastIdRef.current = null;
      return;
    }
    let active = true;
    const poll = () =>
      authedFetch("/api/live/incoming")
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          const next: Offer | undefined = (d.offers ?? [])[0];
          if (next && next.id !== lastIdRef.current) {
            lastIdRef.current = next.id;
            playBell();
          }
          if (!next) lastIdRef.current = null;
          setOffer(next ?? null);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [online, busy]);

  // Ticking clock for the countdown.
  React.useEffect(() => {
    if (!offer) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [offer]);

  if (!offer) return null;

  const secondsLeft = Math.max(0, Math.ceil((offer.offerExpiresAt - now) / 1000));
  const pct = Math.max(0, Math.min(100, ((offer.offerExpiresAt - now) / 15000) * 100));
  const service = SERVICE_MAP[offer.serviceId];
  const earn = Math.round(offer.priceCents / 2);

  async function accept() {
    if (!offer) return;
    setWorking(true);
    try {
      const res = await authedFetch("/api/live/accept", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: offer.id }),
      });
      const d = await res.json();
      if (res.ok && d.appointmentId) {
        router.push(`/visit/${d.appointmentId}`);
        return;
      }
      toast.error(
        d.error === "expired" ? "That offer expired" : "Another nurse took it",
      );
      setOffer(null);
    } catch {
      toast.error("Couldn't accept the visit");
    } finally {
      setWorking(false);
    }
  }

  async function decline() {
    if (!offer) return;
    const id = offer.id;
    setOffer(null);
    try {
      await authedFetch("/api/live/decline", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: id }),
      });
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[var(--radius-lg)] border-2 border-[#d4af37] bg-[var(--card)] shadow-2xl">
        {/* Countdown bar */}
        <div className="h-1.5 w-full bg-[var(--muted)]">
          <div
            className="h-full bg-[#c9a227] transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="p-7 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#c9a227] text-white">
            <PhoneIncoming className="h-7 w-7 animate-pulse" />
          </span>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#f3e7c2] px-2.5 py-1 text-xs font-semibold text-[#8a6d12]">
            <Zap className="h-3.5 w-3.5" /> No-Wait Live request
          </p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">
            {service?.name ?? "Live visit"}
          </h2>
          <p className="mt-1 text-[var(--muted-foreground)]">
            A patient is waiting. You&apos;ll earn{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {formatCurrency(earn)}
            </span>{" "}
            (your 50%).
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-[#9a7d18]">
            {secondsLeft}s
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={decline}
              disabled={working}
            >
              Decline
            </Button>
            <Button className="flex-1" onClick={accept} disabled={working}>
              {working ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneIncoming className="h-4 w-4" />
              )}
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
