import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Hotel,
  LayoutDashboard,
  UserRound,
  Users,
} from "lucide-react";

export type PlatformNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

/** Batch 2 primary navigation — future sections added later without redesign. */
export const PLATFORM_NAV_ITEMS: PlatformNavItem[] = [
  { href: "/platform", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/platform/tenants", label: "Tenants", icon: Building2 },
  { href: "/platform/properties", label: "Properties", icon: Hotel },
  { href: "/platform/users", label: "Users", icon: UserRound },
  { href: "/platform/leads", label: "Leads", icon: Users },
];

export function isPlatformNavActive(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function platformPageTitle(pathname: string): string {
  if (pathname === "/platform") return "Overview";
  if (pathname.startsWith("/platform/leads/")) return "Lead detail";
  if (pathname.startsWith("/platform/leads")) return "Leads";
  if (pathname.startsWith("/platform/tenants/new")) return "Create tenant";
  if (/^\/platform\/tenants\/[^/]+$/.test(pathname)) return "Tenant detail";
  if (pathname.startsWith("/platform/tenants")) return "Tenants";
  if (pathname.startsWith("/platform/properties")) return "Properties";
  if (pathname.startsWith("/platform/users")) return "Users";
  return "Platform";
}

export type PlatformEnvironment = "production" | "preview" | "development";

export function resolvePlatformEnvironment(): PlatformEnvironment {
  const vercel =
    process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "";
  if (vercel === "production" || vercel === "preview" || vercel === "development") {
    return vercel;
  }
  return process.env.NODE_ENV === "production" ? "production" : "development";
}
