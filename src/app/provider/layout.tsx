"use client";

import {
  CalendarClock,
  CalendarRange,
  LayoutDashboard,
  UserRound,
  Wallet,
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/dashboard-shell";
import { IncomingLive } from "@/components/live/incoming-live";
import { PresenceProvider } from "@/components/live/presence-context";

const NAV: NavItem[] = [
  { label: "Overview", href: "/provider", icon: LayoutDashboard },
  { label: "Schedule", href: "/provider/schedule", icon: CalendarRange },
  { label: "Availability", href: "/provider/availability", icon: CalendarClock },
  { label: "Earnings", href: "/provider/earnings", icon: Wallet },
  { label: "Profile", href: "/provider/profile", icon: UserRound },
];

export default function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell role="provider" nav={NAV} brandLabel="Nurse Practitioner">
      <PresenceProvider>
        <IncomingLive />
        {children}
      </PresenceProvider>
    </DashboardShell>
  );
}
