"use client";

import * as React from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ageFromDob, maxAdultDobIso, MIN_PATIENT_AGE, parseDob } from "@/lib/dob";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SENT_KEY = "arx:verify-sent";

/**
 * Shown to patients whose account was created during guest booking (or by an
 * admin) and who haven't set a password yet. One card, three jobs: confirm
 * date of birth (adults only), set a password, and kick off email
 * verification. Hidden once a password exists.
 */
export function FinishAccountCard({
  title = "Finish setting up your account",
  description,
  submitLabel = "Save & continue",
  onSaved,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  submitLabel?: string;
  /** Called after the password + DOB were saved successfully. */
  onSaved?: () => void;
  className?: string;
} = {}) {
  const { user, profile, setPassword, resendVerification } = useAuth();
  const toast = useToast();
  const [pw, setPw] = React.useState("");
  const [dob, setDob] = React.useState(profile?.dob ?? "");
  const [dobError, setDobError] = React.useState<string | null>(null);
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

  function validateDob(value: string): string | null {
    if (!parseDob(value)) return "Enter your date of birth.";
    const age = ageFromDob(value);
    if (age === null) return "Enter a valid date of birth.";
    if (age < MIN_PATIENT_AGE) {
      return `ARSkinRX only treats adults. You must be ${MIN_PATIENT_AGE} or older to be seen — if you're under ${MIN_PATIENT_AGE}, a parent or guardian can book with their own account and join your visit.`;
    }
    if (age > 120) return "Please double-check your date of birth.";
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const dobProblem = validateDob(dob);
    setDobError(dobProblem);
    if (dobProblem) return;
    if (pw.length < 8) {
      toast.error("Password too short", "Use at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await setPassword(pw, { dob });
      toast.success("You're all set", "Use this password next time you log in.");
      onSaved?.();
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
    <Card
      className={
        "border-[var(--primary)]/30 bg-[var(--primary-soft)]/40 p-5 " +
        (className ?? "")
      }
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            {description ??
              "Set a password so you can log back in to join your visit and see your care plan, and confirm your date of birth for your medical record."}
            {verifySent && !user?.emailVerified
              ? ` We also sent a verification link to ${user?.email}.`
              : ""}
          </p>
          <form onSubmit={save} className="mt-3 space-y-3">
            <div>
              <Label htmlFor="finish-dob">Date of birth</Label>
              <Input
                id="finish-dob"
                type="date"
                required
                value={dob}
                max={maxAdultDobIso()}
                min="1900-01-01"
                onChange={(e) => {
                  setDob(e.target.value);
                  if (dobError) setDobError(null);
                }}
                autoComplete="bday"
                aria-invalid={!!dobError}
              />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                We only treat patients {MIN_PATIENT_AGE} and older.
              </p>
              {dobError && (
                <p className="mt-1 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-2.5 py-1.5 text-xs text-[var(--accent)]">
                  {dobError}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="finish-pw">New password</Label>
              <Input
                id="finish-pw"
                type="password"
                required
                minLength={8}
                placeholder="Choose a password (8+ characters)"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {submitLabel}
            </Button>
          </form>
        </div>
      </div>
    </Card>
  );
}
