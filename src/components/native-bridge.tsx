"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { closeExternal, isNativeApp, registerNativePush, toInAppPath } from "@/lib/native";
import { useToast } from "@/components/ui/toast";

/**
 * Mounted once in the root layout. Does nothing on the website; inside the
 * iOS app it wires up the status bar, splash screen, universal links and
 * push notifications.
 */
export function NativeBridge() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  // One-time shell setup.
  React.useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    (async () => {
      const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
      ]);
      if (cancelled) return;
      StatusBar.setStyle({ style: Style.Light }).catch(() => {});
      SplashScreen.hide().catch(() => {});
      const h = await App.addListener("appUrlOpen", ({ url }) => {
        const path = toInAppPath(url);
        if (!path) return;
        // Returning from Stripe Checkout in the Safari sheet: dismiss it first.
        if (url.startsWith("arskinrx://")) void closeExternal();
        router.push(path);
      });
      cleanups.push(() => h.remove());
    })();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [router]);

  // Push registration follows the signed-in user.
  React.useEffect(() => {
    if (!user || !isNativeApp()) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    registerNativePush(
      user,
      (path) => router.push(path),
      (title, body) => toast.info(title, body),
    )
      .then((fn) => {
        if (cancelled) fn();
        else dispose = fn;
      })
      .catch((e) => console.warn("[native] push setup failed", e));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [user, router, toast]);

  return null;
}
