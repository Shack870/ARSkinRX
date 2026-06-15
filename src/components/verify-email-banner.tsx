"use client";

import * as React from "react";
import { MailWarning } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Shows a gentle reminder to verify email. Firebase sends the verification
 * message; users can resend here. Hidden once verified.
 */
export function VerifyEmailBanner() {
  const { user, resendVerification } = useAuth();
  const [sent, setSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  if (!user || user.emailVerified) return null;

  async function resend() {
    setSending(true);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <MailWarning className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Verify your email
            </p>
            <p className="text-sm text-amber-700">
              We sent a verification link to {user.email}. Verify to secure your
              account.
            </p>
          </div>
        </div>
        {sent ? (
          <span className="shrink-0 text-sm text-amber-700">Sent!</span>
        ) : (
          <Button size="sm" variant="outline" onClick={resend} disabled={sending}>
            Resend
          </Button>
        )}
      </div>
    </Card>
  );
}
