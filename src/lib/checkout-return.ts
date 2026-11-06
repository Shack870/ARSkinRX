/**
 * Stripe Checkout return URLs.
 *
 * On the website Stripe sends the patient straight back to the success page.
 * Inside the iOS app Checkout runs in the system Safari sheet (so Apple Pay is
 * available), which can't see the app's session — so Stripe returns to
 * /pay/return instead, and that page hands off to the app via the
 * `arskinrx://` URL scheme.
 */
export function checkoutReturnUrls(
  origin: string,
  opts: { successPath: string; cancelPath: string; native: boolean },
): { success_url: string; cancel_url: string } {
  if (!opts.native) {
    return {
      success_url: `${origin}${opts.successPath}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${opts.cancelPath}`,
    };
  }
  // {CHECKOUT_SESSION_ID} must stay un-encoded for Stripe to substitute it;
  // /pay/return re-attaches it to the target path.
  return {
    success_url: `${origin}/pay/return?to=${encodeURIComponent(opts.successPath)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pay/return?to=${encodeURIComponent(opts.cancelPath)}`,
  };
}

/** Builds the URL-scheme link that reopens the app at an in-app path. */
export function appSchemeUrl(path: string): string {
  return `arskinrx://open?path=${encodeURIComponent(path)}`;
}

/** Only allow relative in-app paths (no protocol-relative or absolute URLs). */
export function safeInAppPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
