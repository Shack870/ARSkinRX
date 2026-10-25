"use client";

import {
  CalendarClock,
  CalendarRange,
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
import { useAuth } from "@/lib/auth-context";

const NAV: NavItem[] = [
  { label: "Overview", href: "/provider", icon: LayoutDashboard },
  { label: "Schedule", href: "/provider/schedule", icon: CalendarRange },
  { label: "Patients", href: "/provider/patients", icon: Users },
  { label: "Availability", href: "/provider/availability", icon: CalendarClock },
  { label: "Earnings", href: "/provider/earnings", icon: Wallet },
  { label: "Profile", href: "/provider/profile", icon: UserRound },
];

const ADMIN_LINK: NavItem[] = [
  { label: "Admin", href: "/admin", icon: ShieldCheck },
];

export default function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin } = useAuth();
  return (
    <DashboardShell
      role="provider"
      nav={NAV}
      switchNav={isAdmin ? ADMIN_LINK : undefined}
      brandLabel="Nurse Practitioner"
    >
      <PresenceProvider>
        <LiveOffers />
        <IncomingLive />
        {children}
      </PresenceProvider>
    </DashboardShell>
  );
}
