"use client";

import { CalendarHeart, LayoutDashboard, Receipt, UserRound } from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/dashboard-shell";

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "My visits", href: "/dashboard/appointments", icon: CalendarHeart },
  { label: "Billing", href: "/dashboard/billing", icon: Receipt },
  { label: "Profile", href: "/dashboard/profile", icon: UserRound },
];

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell role="client" nav={NAV} brandLabel="My care">
      {children}
    </DashboardShell>
  );
}
