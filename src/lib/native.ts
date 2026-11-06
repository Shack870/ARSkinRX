import type { User } from "firebase/auth";

/**
 * Helpers for the native iOS shell (Capacitor). Everything here is a no-op
 * on the plain website: `window.Capacitor` only exists when the page is
 * running inside the app's WebView, and the plugin modules are imported
 * lazily so they never land in the web bundle's critical path.
 */

const TOKEN_KEY = "arskinrx.pushToken";

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.Capacitor?.isNativePlatform?.() === true;
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (!isNativeApp()) return "web";
  const p = window.Capacitor?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}

/**
 * Turns a universal link, push URL or `arskinrx://open?path=…` scheme URL
 * into a router path.
 */
export function toInAppPath(url: string): string | null {
  try {
    if (url.startsWith("arskinrx://")) {
      const path = new URL(url).searchParams.get("path");
      return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
    }
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin && !/(^|\.)arskinrx\.com$/.test(u.hostname)) {
      return null;
    }
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

async function postToken(user: User, token: string, method: "POST" | "DELETE") {
  const idToken = await user.getIdToken();
  const platform = nativePlatform();
  await fetch("/api/push/register", {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, platform }),
  });
}

/**
 * Asks for notification permission (first time only) and registers the
 * device token for `user`. Safe to call repeatedly; re-registers on each
 * launch so account switches are picked up.
 */
export async function registerNativePush(
  user: User,
  onOpen: (path: string) => void,
  onForeground?: (title: string, body: string) => void,
): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  const { PushNotifications } = await import("@capacitor/push-notifications");

  const handles = await Promise.all([
    PushNotifications.addListener("registration", async ({ value }) => {
      try {
        localStorage.setItem(TOKEN_KEY, value);
        await postToken(user, value, "POST");
      } catch (e) {
        console.warn("[native] push register failed", e);
      }
    }),
    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[native] push registration error", err);
    }),
    PushNotifications.addListener("pushNotificationReceived", (n) => {
      if (onForeground && (n.title || n.body)) onForeground(n.title ?? "ARSkinRX", n.body ?? "");
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification.data as { url?: string } | undefined)?.url;
      if (typeof url === "string" && url) {
        const path = url.startsWith("/") ? url : toInAppPath(url);
        if (path) onOpen(path);
      }
    }),
  ]);

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive === "granted") {
    await PushNotifications.register();
  }

  return () => {
    for (const h of handles) h.remove();
  };
}

/** Call before Firebase sign-out so the token can be removed with a valid ID token. */
export async function unregisterNativePush(user: User | null): Promise<void> {
  if (!user || !isNativeApp()) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await postToken(user, token, "DELETE");
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Best effort; stale tokens are pruned server-side on APNs 410.
  }
}

/** Closes the in-app Safari sheet if one is open (no-op otherwise). */
export async function closeExternal(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    // nothing open
  }
}

/**
 * Sends the user to Stripe Checkout. On the website this is a plain redirect.
 * In the app, Checkout opens in the system Safari sheet so Apple Pay is
 * available; Stripe then returns to /pay/return, which reopens the app.
 * Resolves when the sheet closes (payment done or user dismissed it).
 */
export async function goToCheckout(url: string): Promise<void> {
  let external = false;
  try {
    external = new URL(url, window.location.origin).origin !== window.location.origin;
  } catch {
    external = false;
  }
  if (!isNativeApp() || !external) {
    window.location.href = url;
    return;
  }
  const { Browser } = await import("@capacitor/browser");
  await new Promise<void>((resolve) => {
    let handle: { remove: () => void } | null = null;
    Browser.addListener("browserFinished", () => {
      handle?.remove();
      resolve();
    }).then((h) => (handle = h));
    Browser.open({ url }).catch(() => {
      handle?.remove();
      resolve();
    });
  });
}
