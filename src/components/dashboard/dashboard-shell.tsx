"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function DashboardShell({
  role,
  nav,
  brandLabel,
  children,
}: {
  role: Role;
  nav: NavItem[];
  brandLabel: string;
  children: React.ReactNode;
}) {
  const { user, profile, role: userRole, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const currentLabel = nav.find((n) => n.href === pathname)?.label;

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (userRole && userRole !== role) {
      // Logged in but wrong role for this area.
      router.replace("/");
    }
  }, [loading, user, userRole, role, router, pathname]);

  if (loading || !user || (userRole && userRole !== role)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--muted)] md:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)] md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-[var(--border)] px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)]">
            AR
          </span>
          <span className="font-semibold">
            ARSkin<span className="text-[var(--primary)]">RX</span>
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <p className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            {brandLabel}
          </p>
          {nav.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>
        <div className="border-t border-[var(--border)] p-3">
          <div className="px-3 py-2 text-sm">
            <p className="truncate font-medium">{profile?.displayName ?? "—"}</p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">
              {profile?.email ?? user.email}
            </p>
          </div>
          <button
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/90 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] text-xs font-bold text-[var(--primary-foreground)]">
            AR
          </span>
          <span className="text-sm font-semibold">
            {currentLabel ?? brandLabel}
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile slide-in drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col bg-[var(--card)] shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
              <span className="flex items-center gap-2 font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] text-xs font-bold text-[var(--primary-foreground)]">
                  AR
                </span>
                ARSkin<span className="-ml-1.5 text-[var(--primary)]">RX</span>
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {brandLabel}
              </p>
              {nav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  large
                />
              ))}
            </nav>
            <div className="border-t border-[var(--border)] p-3">
              <div className="px-3 py-2 text-sm">
                <p className="truncate font-medium">
                  {profile?.displayName ?? "—"}
                </p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {profile?.email ?? user.email}
                </p>
              </div>
              <button
                onClick={async () => {
                  await signOut();
                  router.push("/");
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
    </div>
  );
}

function NavLink({
  item,
  active,
  large,
}: {
  item: NavItem;
  active: boolean;
  large?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] font-medium transition-colors",
        large ? "px-3 py-3 text-[15px]" : "px-3 py-2 text-sm",
        active
          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
      )}
    >
      <Icon className={large ? "h-5 w-5" : "h-4 w-4"} />
      {item.label}
    </Link>
  );
}
