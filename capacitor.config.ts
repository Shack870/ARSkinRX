import type { CapacitorConfig } from "@capacitor/cli";

// iOS shell for arskinrx.com. The native app is a thin WebView that loads the
// production site directly (same approach as the Android TWA in /android), so
// web deploys update the app without an App Store release.
const config: CapacitorConfig = {
  appId: "com.arskinrx.app",
  appName: "ARSkinRX",
  // Bundled fallback (ios-web/index.html) shown only if the site can't load.
  webDir: "ios-web",
  server: {
    url: "https://arskinrx.com",
    // Hosts that may be loaded inside the WebView rather than Safari.
    allowNavigation: [
      "arskinrx.com",
      "*.arskinrx.com",
      "checkout.stripe.com",
      "js.stripe.com",
      "m.stripe.network",
      "*.stripe.com",
      "arskinrx.firebaseapp.com",
      "*.googleapis.com",
    ],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      // Hidden by NativeBridge as soon as the site mounts; the duration is a
      // safety net for slow networks.
      launchShowDuration: 4000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: "#fbfaf7",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#fbfaf7",
    },
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#fbfaf7",
    // Keep the WebKit viewport honest for Safari-style layouts.
    preferredContentMode: "mobile",
    scheme: "ARSkinRX",
    allowsLinkPreview: false,
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
