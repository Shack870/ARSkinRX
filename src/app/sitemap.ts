import type { MetadataRoute } from "next";
import { SERVICES } from "@/lib/services";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://arskin--arskinrx.us-east4.hosted.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = [
    "",
    "/book",
    "/providers/apply",
    "/login",
    "/register",
    "/legal/terms",
    "/legal/privacy",
    "/legal/consent",
  ];
  const servicePaths = SERVICES.map((s) => `/services/${s.slug}`);

  return [...staticPaths, ...servicePaths].map((path) => ({
    url: `${APP_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
}
