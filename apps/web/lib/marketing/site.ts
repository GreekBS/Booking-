/**
 * Central marketing site configuration.
 * Prefer NEXT_PUBLIC_SITE_URL; fall back to AUTH_URL / VERCEL_URL — never invent a domain.
 */

export const TALOS_BRAND = {
  name: "Talos",
  tagline: "One platform for running and growing a hospitality business.",
  legalName: "Talos",
} as const;

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const authUrl = process.env.AUTH_URL?.replace(/\/$/, "");
  if (authUrl) return authUrl;

  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;

  return "http://localhost:3000";
}

export function getContactEmail(): string | null {
  const email = process.env.NEXT_PUBLIC_TALOS_CONTACT_EMAIL?.trim();
  return email || null;
}

/** Indexed marketing routes with genuine content in this phase. */
export const MARKETING_ROUTES = [
  {
    path: "/",
    title: "Hospitality platform for operators and owners",
    changeFrequency: "weekly" as const,
    priority: 1,
  },
  {
    path: "/pms",
    title: "Property management system",
    changeFrequency: "monthly" as const,
    priority: 0.9,
  },
  {
    path: "/website-builder",
    title: "Branded property presence",
    changeFrequency: "monthly" as const,
    priority: 0.9,
  },
  {
    path: "/direct-bookings",
    title: "Direct bookings",
    changeFrequency: "monthly" as const,
    priority: 0.85,
  },
  {
    path: "/channel-manager",
    title: "Channel distribution",
    changeFrequency: "monthly" as const,
    priority: 0.8,
  },
  {
    path: "/property-management",
    title: "Full property management",
    changeFrequency: "monthly" as const,
    priority: 0.9,
  },
  {
    path: "/vacation-rental-software",
    title: "Vacation rental software",
    changeFrequency: "monthly" as const,
    priority: 0.85,
  },
  {
    path: "/contact",
    title: "Contact",
    changeFrequency: "yearly" as const,
    priority: 0.5,
  },
] as const;

export type MarketingNavItem = {
  label: string;
  href: string;
};

export const PRIMARY_NAV: MarketingNavItem[] = [
  { label: "Platform", href: "/pms" },
  { label: "Property presence", href: "/website-builder" },
  { label: "Direct Bookings", href: "/direct-bookings" },
  { label: "Property Management", href: "/property-management" },
];

export const FOOTER_GROUPS: Array<{
  title: string;
  links: MarketingNavItem[];
}> = [
  {
    title: "Platform",
    links: [
      { label: "PMS", href: "/pms" },
      { label: "Channel distribution", href: "/channel-manager" },
      { label: "Direct bookings", href: "/direct-bookings" },
      { label: "Property presence", href: "/website-builder" },
      { label: "Vacation rental software", href: "/vacation-rental-software" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Full property management", href: "/property-management" },
      { label: "For operators", href: "/pms" },
      { label: "For owners", href: "/property-management" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "Contact", href: "/contact" }],
  },
];

/** Paths unauthenticated visitors may access (middleware allowlist). */
export const PUBLIC_MARKETING_PATHS = [
  "/",
  "/pms",
  "/website-builder",
  "/direct-bookings",
  "/channel-manager",
  "/property-management",
  "/vacation-rental-software",
  "/contact",
] as const;

export function isPublicMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_MARKETING_PATHS.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}
