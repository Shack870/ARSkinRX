"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * On a Stripe return (`?paid=1&session_id=cs_…`) with no Firebase session,
 * try to resume the paying guest's account before anyone redirects to login.
 * Returns true while the attempt is in flight so callers hold their redirect.
 */
export function usePaymentResume(): boolean {
  const { user, loading, signInWithToken } = useAuth();
  // Read the query lazily from the browser so this hook needs no Suspense
  // boundary (unlike useSearchParams) and can live in layout-level shells.
  const [params] = React.useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search),
  );
  const sessionId = params?.get("session_id") ?? null;
  const eligible =
    !loading && !user && params?.get("paid") === "1" && !!sessionId?.startsWith("cs_");
  const [done, setDone] = React.useState(false);
  const attempted = React.useRef(false);

  React.useEffect(() => {
    if (!eligible || attempted.current) return;
    attempted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (res.ok) {
          const { customToken } = await res.json();
          await signInWithToken(customToken);
        }
      } catch {
        /* fall through to the normal login redirect */
      } finally {
        if (!cancelled) setDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, sessionId, signInWithToken]);

  // Hold the redirect while a resume is possible-but-not-yet-attempted, too.
  return eligible && !done;
}
