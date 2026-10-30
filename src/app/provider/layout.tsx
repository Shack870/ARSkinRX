"use client";

import * as React from "react";
import {
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  Circle,
  LayoutDashboard,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/dashboard-shell";
import { IncomingLive } from "@/components/live/incoming-live";
import { LiveOffers } from "@/components/live/live-offers";
import { PresenceProvider } from "@/components/live/presence-context";
import {
  PROFILE_PATH,
  ProviderSetupGate,
  SCHEDULE_PATH,
  useProviderSetup,
} from "@/components/provider/setup-gate";
import { useAuth } from "@/lib/auth-context";

const NAV: NavItem[] = [
  { label: "Overview", href: "/provider", icon: LayoutDashboard },
  { label: "Schedule", href: "/provider/schedule", icon: CalendarRange },
  { label: "Patients", href: "/provider/patients", icon: Users },
  { label: "Availability", href: SCHEDULE_PATH, icon: CalendarClock },
  { label: "Earnings", href: "/provider/earnings", icon: Wallet },
  { label: "Profile", href: PROFILE_PATH, icon: UserRound },
];

const ADMIN_LINK: NavItem[] = [
  { label: "Admin", href: "/admin", icon: ShieldCheck },
];

export default function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = useAuth();
  const setup = useProviderSetup(user?.uid, isAdmin);

  // While first-time setup is pending, every other page is locked and the
  // sidebar says so, instead of silently bouncing taps back to the setup page.
  const target =
    setup.required === "schedule"
      ? SCHEDULE_PATH
      : setup.required === "profile"
        ? PROFILE_PATH
        : null;
  const hint =
    setup.required === "schedule"
      ? "Save your weekly schedule first — then the rest of your dashboard opens."
      : "Finish your profile (photo and bio) first — then the rest of your dashboard opens.";
  const nav = target
    ? NAV.map((item) =>
        item.href === target ? item : { ...item, locked: true, lockedHint: hint },
      )
    : NAV;

  return (
    <DashboardShell
      role="provider"
      nav={nav}
      switchNav={isAdmin ? ADMIN_LINK : undefined}
      brandLabel="Nurse Practitioner"
      notice={
        target ? (
          <SetupNotice hasSchedule={setup.hasSchedule} hasProfile={setup.hasProfile} />
        ) : undefined
      }
    >
      <PresenceProvider>
        <LiveOffers />
        <IncomingLive />
        <ProviderSetupGate>{children}</ProviderSetupGate>
      </PresenceProvider>
    </DashboardShell>
  );
}

function SetupNotice({
  hasSchedule,
  hasProfile,
}: {
  hasSchedule: boolean;
  hasProfile: boolean;
}) {
  return (
    <div className="mb-2 rounded-[var(--radius-md)] border border-[var(--primary)]/40 bg-[var(--primary-soft)] p-3 text-sm">
      <p className="font-semibold">Finish setup to unlock your dashboard</p>
      <ul className="mt-2 space-y-1.5">
        <Step done={hasSchedule} label="1. Save your weekly schedule (or choose live-only)" />
        <Step done={hasProfile} label="2. Add a photo and bio" />
      </ul>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Overview, Go Live, Schedule, Patients, and Earnings open as soon as both
        are done.
      </p>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-[var(--primary)]" />
      ) : (
        <Circle className="h-4 w-4 text-[var(--muted-foreground)]" />
      )}
      <span className={done ? "line-through opacity-60" : "font-medium"}>{label}</span>
    </li>
  );
}
