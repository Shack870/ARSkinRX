import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://arskinrx.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private/authenticated areas out of search results.
      disallow: ["/api/", "/admin", "/provider", "/dashboard", "/visit", "/live"],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
