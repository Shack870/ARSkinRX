"use client";

import * as React from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { Loader2, MailCheck } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch {
      // Don't reveal whether an account exists.
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-[var(--muted)] px-4 py-16">
        <Card className="w-full max-w-md p-8">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-10 w-10 text-[var(--primary)]" />
              <h1 className="mt-3 text-xl font-semibold tracking-tight">
                Check your email
              </h1>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                If an account exists for {email}, we&apos;ve sent a link to reset
                your password.
              </p>
              <Link href="/login" className="mt-6 inline-block">
                <Button variant="outline">Back to login</Button>
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                Reset your password
              </h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Enter your email and we&apos;ll send you a reset link.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-[var(--accent)]">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
                Remembered it?{" "}
                <Link href="/login" className="text-[var(--primary)] underline">
                  Log in
                </Link>
              </p>
            </>
          )}
        </Card>
      </main>
    </>
  );
}
