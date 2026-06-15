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
  createdAt: number;
}

/**
 * Shows online nurses incoming No-Wait Live requests they can accept. Polls
 * while live; first nurse to accept gets the visit.
 */
export function LiveOffers() {
  const router = useRouter();
  const toast = useToast();
  const { online, busy } = usePresence();
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [accepting, setAccepting] = React.useState(false);

  React.useEffect(() => {
    if (!online || busy) {
      setOffers([]);
      return;
    }
    let active = true;
    const poll = () =>
      authedFetch("/api/live/incoming")
        .then((r) => r.json())
        .then((d) => {
          if (active) setOffers(d.offers ?? []);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [online, busy]);

  const offer = offers.find((o) => !dismissed.has(o.id));
  if (!offer) return null;

  const service = SERVICE_MAP[offer.serviceId];
  const earn = Math.round(offer.priceCents / 2);

  async function accept() {
    if (!offer) return;
    setAccepting(true);
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
        d.error === "taken"
          ? "Another nurse took that visit"
          : d.error === "expired"
            ? "That request expired"
            : "Couldn't accept the visit",
      );
      setDismissed((s) => new Set(s).add(offer.id));
    } catch {
      toast.error("Couldn't accept the visit");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border-2 border-[#d4af37] bg-[var(--card)] p-7 text-center shadow-2xl">
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
          A patient is waiting now. You&apos;ll earn{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {formatCurrency(earn)}
          </span>{" "}
          (your 50%).
        </p>
        <div className="mt-6 flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() =>
              setDismissed((s) => new Set(s).add(offer.id))
            }
            disabled={accepting}
          >
            Not now
          </Button>
          <Button className="flex-1" onClick={accept} disabled={accepting}>
            {accepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PhoneIncoming className="h-4 w-4" />
            )}
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
