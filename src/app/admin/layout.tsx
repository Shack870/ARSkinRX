"use client";

import {
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/dashboard-shell";
import { useAuth } from "@/lib/auth-context";
import { useProviderProfile } from "@/lib/hooks";

const NAV: NavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Revenue", href: "/admin/revenue", icon: TrendingUp },
  { label: "Providers", href: "/admin/providers", icon: Stethoscope },
  { label: "Patients", href: "/admin/patients", icon: Users },
  { label: "Appointments", href: "/admin/appointments", icon: CalendarRange },
  { label: "Payments", href: "/admin/payments", icon: CreditCard },
  { label: "Payouts", href: "/admin/payouts", icon: Wallet },
  { label: "Services", href: "/admin/services", icon: ListChecks },
  { label: "Audit log", href: "/admin/audit", icon: ScrollText },
];

const PROVIDER_LINK: NavItem[] = [
  { label: "My provider dashboard", href: "/provider", icon: Stethoscope },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = useAuth();
  const { profile: providerProfile } = useProviderProfile(user?.uid);
  const isProvider = role === "provider" || providerProfile !== null;
  return (
    <DashboardShell
      role="admin"
      nav={NAV}
      switchNav={isProvider ? PROVIDER_LINK : undefined}
      brandLabel="Admin"
    >
      {children}
    </DashboardShell>
  );
}
