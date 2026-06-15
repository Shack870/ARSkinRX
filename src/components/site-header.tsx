"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/types";

const NAV_LINKS = [
  { href: "/#services", label: "Services" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/providers/apply", label: "For nurse practitioners" },
];

function dashboardHref(role: Role | null): string {
  if (role === "provider") return "/provider";
  if (role === "admin") return "/admin";
  return "/dashboard";
}

export function SiteHeader() {
  const { user, role, loading } = useAuth();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)]">
            AR
          </span>
          <span className="text-lg font-semibold tracking-tight">
            ARSkin<span className="text-[var(--primary)]">RX</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-[var(--primary)]">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <Link href={dashboardHref(role)} className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Dashboard
              </Button>
            </Link>
          ) : (
            <Link href="/login" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
          )}
          <Link href={!loading && user && role !== "client" ? dashboardHref(role) : "/book"}>
            <Button size="sm">
              {!loading && user && role !== "client" ? "Dashboard" : "Book a visit"}
            </Button>
          </Link>
          <button
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--muted)] md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--background)] md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 text-sm font-medium">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-md)] px-3 py-2 hover:bg-[var(--muted)]"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href={!loading && user ? dashboardHref(role) : "/login"}
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-md)] px-3 py-2 hover:bg-[var(--muted)]"
            >
              {!loading && user ? "My dashboard" : "Log in"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
