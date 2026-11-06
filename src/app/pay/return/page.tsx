"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { appSchemeUrl, safeInAppPath } from "@/lib/checkout-return";

/**
 * Landing page for Stripe Checkout when payment was started from the iOS
 * app. Checkout runs in the system Safari sheet (so Apple Pay works), which
 * doesn't share the app's login — so instead of rendering the receipt here we
 * bounce straight back into the app via the arskinrx:// URL scheme.
 */
function ReturnInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const canceled = !sessionId;

  const target = React.useMemo(() => {
    const to = safeInAppPath(params.get("to")) ?? "/dashboard";
    if (!sessionId) return to;
    return `${to}${to.includes("?") ? "&" : "?"}session_id=${encodeURIComponent(sessionId)}`;
  }, [params, sessionId]);

  const appUrl = appSchemeUrl(target);

  React.useEffect(() => {
    // Hand off to the app. If it isn't installed nothing happens and the
    // buttons below remain usable.
    const t = setTimeout(() => {
      window.location.href = appUrl;
    }, 150);
    return () => clearTimeout(t);
  }, [appUrl]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
        {canceled ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : (
          <CheckCircle2 className="h-8 w-8" />
        )}
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {canceled ? "Returning to ARSkinRX" : "Payment received"}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--muted-foreground)]">
        {canceled
          ? "No charge was made. Taking you back to the app."
          : "You're all set. Taking you back to the ARSkinRX app to continue."}
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <a href={appUrl}>
          <Button className="w-full">Open ARSkinRX</Button>
        </a>
        <a href={target}>
          <Button variant="ghost" className="w-full">
            Continue in the browser instead
          </Button>
        </a>
      </div>
    </main>
  );
}

export default function PayReturnPage() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        </main>
      }
    >
      <ReturnInner />
    </React.Suspense>
  );
}
