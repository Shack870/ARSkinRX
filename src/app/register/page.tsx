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
import { authedFetch } from "@/lib/api-client";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}

function RegisterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { signUp, refreshClaims } = useAuth();
  const [form, setForm] = React.useState({
    displayName: "",
    email: "",
    password: "",
    phone: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.displayName.trim().length < 2) return setError("Enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError("Enter a valid email.");
    if (form.password.length < 8)
      return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      await signUp(form.email, form.password, form.displayName);
      const res = await authedFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          displayName: form.displayName,
          phone: form.phone,
        }),
      });
      if (!res.ok) throw new Error("Could not finish creating your account.");
      await refreshClaims();
      router.push(params.get("next") ?? "/dashboard");
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes("email-already")
          ? "That email is already registered. Try logging in."
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      setError(msg);
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Book visits and manage your care in one place.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={form.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone (for visit reminders)</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p className="rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--primary)] underline">
              Log in
            </Link>
          </p>
        </Card>
      </main>
    </>
  );
}
