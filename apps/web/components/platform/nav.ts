import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  Cable,
  ClipboardList,
  Hotel,
  LayoutDashboard,
  Settings,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";

export type PlatformNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export type PlatformNavSection = {
  id: string;
  label?: string;
  items: PlatformNavItem[];
};

/** Final Platform Control Center navigation (Batches 1–4). */
export const PLATFORM_NAV_SECTIONS: PlatformNavSection[] = [
  {
    id: "overview",
    items: [
      { href: "/platform", label: "Overview", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    id: "directory",
    label: "Directory",
    items: [
      { href: "/platform/tenants", label: "Tenants", icon: Building2 },
      { href: "/platform/properties", label: "Properties", icon: Hotel },
      { href: "/platform/users", label: "Users", icon: UserRound },
      { href: "/platform/leads", label: "Leads", icon: Users },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/platform/channels", label: "Channels", icon: Cable },
      { href: "/platform/operations", label: "Operations", icon: Workflow },
      { href: "/platform/health", label: "Platform Health", icon: Activity },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { href: "/platform/audit", label: "Audit Log", icon: ClipboardList },
      { href: "/platform/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const PLATFORM_NAV_ITEMS: PlatformNavItem[] =
  PLATFORM_NAV_SECTIONS.flatMap((section) => section.items);

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
  if (/^\/platform\/channels\/[^/]+\/[^/]+$/.test(pathname)) {
    return "Channel detail";
  }
  if (pathname.startsWith("/platform/channels")) return "Channels";
  if (pathname.startsWith("/platform/operations")) return "Operations";
  if (pathname.startsWith("/platform/health")) return "Platform Health";
  if (pathname.startsWith("/platform/audit")) return "Audit Log";
  if (pathname.startsWith("/platform/settings")) return "Settings";
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
