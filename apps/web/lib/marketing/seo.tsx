import type { Metadata } from "next";
import { getSiteUrl, TALOS_BRAND } from "./site";

export function absoluteUrl(path = "/"): string {
  const base = getSiteUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const url = absoluteUrl(input.path);
  const title = input.title;

  return {
    title,
    description: input.description,
    alternates: { canonical: url },
    robots: input.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: TALOS_BRAND.name,
      title: `${title} · ${TALOS_BRAND.name}`,
      description: input.description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${TALOS_BRAND.name}`,
      description: input.description,
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: TALOS_BRAND.name,
    url: getSiteUrl(),
    description: TALOS_BRAND.tagline,
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: TALOS_BRAND.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: TALOS_BRAND.tagline,
    url: getSiteUrl(),
  };
}

/** Soft service schema — no reviews, ratings, or fabricated guarantees. */
export function serviceJsonLd(input: {
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    provider: {
      "@type": "Organization",
      name: TALOS_BRAND.name,
    },
    url: absoluteUrl(input.path),
    areaServed: "Europe",
  };
}

export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
