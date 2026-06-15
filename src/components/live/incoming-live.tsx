"use client";

import * as React from "react";
import Link from "next/link";
import { PhoneCall, Video } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProviderAppointments } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { Button } from "@/components/ui/button";

/**
 * Full-screen "incoming live visit" prompt for nurses. Appears when a live
 * request has been matched to them and they haven't joined yet.
 */
export function IncomingLive() {
  const { user, role } = useAuth();
  const { appointments } = useProviderAppointments(user?.uid);

  if (role !== "provider") return null;

  const now = Date.now();
  const incoming = appointments.find(
    (a) =>
      a.isLive &&
      a.status === "in_progress" &&
      !a.joinedAt?.provider &&
      now - a.start < 10 * 60 * 1000,
  );
  if (!incoming) return null;

  const service = SERVICE_MAP[incoming.serviceId];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-2xl">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
          <PhoneCall className="h-7 w-7 animate-pulse" />
        </span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">
          Incoming live visit
        </h2>
        <p className="mt-1 text-[var(--muted-foreground)]">
          A patient is waiting now for a{" "}
          <span className="font-medium text-[var(--foreground)]">
            {service?.name ?? "visit"}
          </span>
          .
        </p>
        <Link href={`/visit/${incoming.id}`} className="mt-6 block">
          <Button size="lg" className="w-full">
            <Video className="h-5 w-5" /> Join now
          </Button>
        </Link>
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Connecting you keeps your real-time rating strong.
        </p>
      </div>
    </div>
  );
}
