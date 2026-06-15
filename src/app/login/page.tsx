"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/types";

function destinationForRole(role: Role | null): string {
  if (role === "provider") return "/provider";
  if (role === "admin") return "/admin";
  return "/dashboard";
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await signIn(email, password);
      const tokenResult = await user.getIdTokenResult();
      const role = (tokenResult.claims.role as Role) ?? null;
      const next = params.get("next") ?? destinationForRole(role);
      router.push(next);
    } catch {
      setError("Incorrect email or password.");
      setLoading(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--muted)] px-4 py-16">
        <div className="arx-blob -left-10 top-10 h-64 w-64 bg-[#7fc6b6]" />
        <div className="arx-blob -right-10 bottom-10 h-64 w-64 bg-[#e7b8a8]" />
        <Card className="w-full max-w-md p-8 arx-glow">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Log in to your ARSkinRX account.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="mb-1.5 text-xs text-[var(--primary)] hover:underline"
                >
                  Forgot?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Log in
            </Button>
          </form>
          <div className="mt-6 space-y-1 text-center text-sm text-[var(--muted-foreground)]">
            <p>
              New patient?{" "}
              <Link href="/book" className="text-[var(--primary)] underline">
                Book a visit
              </Link>
            </p>
            <p>
              Are you an APRN?{" "}
              <Link
                href="/providers/apply"
                className="text-[var(--primary)] underline"
              >
                Apply to practice
              </Link>
            </p>
          </div>
        </Card>
      </main>
    </>
  );
}
