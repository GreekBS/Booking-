import type { MetadataRoute } from "next";
import { getSiteUrl, MARKETING_ROUTES } from "@/lib/marketing/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return MARKETING_ROUTES.map((route) => ({
    url: route.path === "/" ? base : `${base}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
