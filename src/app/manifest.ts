import type { MetadataRoute } from "next";

// Web app manifest. Also consumed by Bubblewrap (android/twa-manifest.json)
// when packaging the site as a Trusted Web Activity for Google Play.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ARSkinRX",
    short_name: "ARSkinRX",
    description:
      "Online dermatology visits with licensed Arkansas nurse practitioners. Book, pay, and meet by video for acne, anti-aging, rosacea, hair, nail health, and more.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#2f6f6a",
    categories: ["medical", "health"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
