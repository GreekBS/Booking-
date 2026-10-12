/**
 * Central marketing site configuration.
 * Prefer NEXT_PUBLIC_SITE_URL; fall back to AUTH_URL / VERCEL_URL — never invent a domain.
 */

export const TALOS_BRAND = {
  name: "Talos",
  tagline: "Μια πλατφόρμα για τη λειτουργία και την ανάπτυξη μιας επιχείρησης φιλοξενίας.",
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
    title: "Πλατφόρμα φιλοξενίας για διαχειριστές και ιδιοκτήτες",
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
  {
    path: "/privacy",
    title: "Privacy Policy",
    changeFrequency: "yearly" as const,
    priority: 0.3,
  },
  {
    path: "/terms",
    title: "Terms of Service",
    changeFrequency: "yearly" as const,
    priority: 0.3,
  },
  {
    path: "/data-deletion",
    title: "User data deletion",
    changeFrequency: "yearly" as const,
    priority: 0.3,
  },
] as const;

export type MarketingNavItem = {
  label: string;
  href: string;
};

export const PRIMARY_NAV: MarketingNavItem[] = [
  { label: "Πλατφόρμα", href: "/pms" },
  { label: "Παρουσία καταλύματος", href: "/website-builder" },
  { label: "Απευθείας κρατήσεις", href: "/direct-bookings" },
  { label: "Διαχείριση καταλυμάτων", href: "/property-management" },
];

export const FOOTER_GROUPS: Array<{
  title: string;
  links: MarketingNavItem[];
}> = [
  {
    title: "Πλατφόρμα",
    links: [
      { label: "PMS", href: "/pms" },
      { label: "Διανομή καναλιών", href: "/channel-manager" },
      { label: "Απευθείας κρατήσεις", href: "/direct-bookings" },
      { label: "Παρουσία καταλύματος", href: "/website-builder" },
      { label: "Λογισμικό βραχυχρόνιας μίσθωσης", href: "/vacation-rental-software" },
    ],
  },
  {
    title: "Λύσεις",
    links: [
      { label: "Πλήρης διαχείριση καταλυμάτων", href: "/property-management" },
      { label: "Για διαχειριστές", href: "/pms" },
      { label: "Για ιδιοκτήτες", href: "/property-management" },
    ],
  },
  {
    title: "Εταιρεία",
    links: [
      { label: "Επικοινωνία", href: "/contact" },
      { label: "Απόρρητο", href: "/privacy" },
      { label: "Όροι", href: "/terms" },
      { label: "Διαγραφή δεδομένων", href: "/data-deletion" },
    ],
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
  "/privacy",
  "/terms",
  "/data-deletion",
  "/get-started",
] as const;

export function isPublicMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_MARKETING_PATHS.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}
