import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/marketing/site";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/platform",
          "/api/",
          "/login",
          "/register",
          "/forgot-password",
          "/invite",
          "/dev",
          "/w/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
