import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ARSkinRX — Virtual Skin Care Clinic",
    short_name: "ARSkinRX",
    description:
      "Online dermatology visits with licensed Arkansas nurse practitioners.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#2f6f6a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
