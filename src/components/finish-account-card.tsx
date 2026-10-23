"use client";

import * as React from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SENT_KEY = "arx:verify-sent";

/**
 * Shown to patients whose account was created during guest booking (or by an
 * admin) and who haven't set a password yet. One card, two jobs: set a
 * password, and kick off email verification. Hidden once a password exists.
 */
export function FinishAccountCard() {
  const { user, profile, setPassword, resendVerification } = useAuth();
  const toast = useToast();
  const [pw, setPw] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [verifySent, setVerifySent] = React.useState(
    () =>
      typeof window !== "undefined" &&
      !!user &&
      !!sessionStorage.getItem(`${SENT_KEY}:${user.uid}`),
  );

  const needsPassword = !!user && profile?.passwordSet === false;

  // Send the verification email once, automatically, the first time we show.
  React.useEffect(() => {
    if (!needsPassword || !user || user.emailVerified) return;
    const key = `${SENT_KEY}:${user.uid}`;
    if (sessionStorage.getItem(key)) return;
    resendVerification()
      .then(() => {
        sessionStorage.setItem(key, "1");
        setVerifySent(true);
      })
      .catch(() => {});
  }, [needsPassword, user, resendVerification]);

  if (!needsPassword) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("Password too short", "Use at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await setPassword(pw);
      toast.success("You're all set", "Use this password next time you log in.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/requires-recent-login/.test(msg)) {
        // Session is too old for a direct password change; fall back to the
        // emailed reset link, which also works for password-less accounts.
        toast.info(
          "Check your email",
          "For security, we sent you a link to set your password.",
        );
        try {
          const { sendPasswordResetEmail } = await import("firebase/auth");
          const { auth } = await import("@/lib/firebase/client");
          if (user?.email) await sendPasswordResetEmail(auth, user.email);
        } catch {
          // ignore
        }
      } else {
        toast.error("Couldn't save password", "Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-[var(--primary)]/30 bg-[var(--primary-soft)]/40 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Finish setting up your account</p>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            Set a password so you can log back in to join your visit and see
            your care plan.
            {verifySent && !user?.emailVerified
              ? ` We also sent a verification link to ${user?.email}.`
              : ""}
          </p>
          <form onSubmit={save} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="finish-pw" className="sr-only">
                New password
              </Label>
              <Input
                id="finish-pw"
                type="password"
                placeholder="Choose a password (8+ characters)"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Save password
            </Button>
          </form>
        </div>
      </div>
    </Card>
  );
}
