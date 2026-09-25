import Link from "next/link";
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  CalendarDays,
  DollarSign,
  BookOpen,
  Users,
  UserCog,
  Sparkles,
  Shield,
  Settings,
  Network,
  Wallet,
  FileText,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

export type AdminNavSection = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

/** Grouped operator navigation — routes unchanged; grouping is presentation only. */
export const adminNavSections: AdminNavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/dashboard/bookings", label: "Bookings", icon: BookOpen },
      { href: "/dashboard/availability", label: "Availability", icon: CalendarDays },
      { href: "/dashboard/guests", label: "Guests", icon: Users },
    ],
  },
  {
    id: "revenue",
    label: "Revenue",
    items: [
      { href: "/dashboard/pricing", label: "Pricing", icon: DollarSign },
      { href: "/dashboard/payments", label: "Payments", icon: Wallet },
      { href: "/dashboard/fiscal-documents", label: "Fiscal Documents", icon: FileText },
    ],
  },
  {
    id: "distribution",
    label: "Distribution",
    items: [{ href: "/dashboard/channels", label: "Channels", icon: Network }],
  },
  {
    id: "property",
    label: "Property",
    items: [
      { href: "/dashboard/properties", label: "Properties", icon: Building2 },
      { href: "/dashboard/units", label: "Units", icon: DoorOpen },
      { href: "/dashboard/amenities", label: "Amenities", icon: Sparkles },
      { href: "/dashboard/policies", label: "Policies", icon: Shield },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      { href: "/dashboard/members", label: "Members", icon: UserCog },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Flat list for breadcrumbs / active matching. */
export const adminNavItems: AdminNavItem[] = adminNavSections.flatMap((s) => s.items);

export function isNavActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const COLLAPSE_KEY = "talos.admin.sidebar.collapsed";

export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    sessionStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface AdminSidebarProps {
  pathname: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
}

export function AdminSidebar({
  pathname,
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: AdminSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn(
            "font-display text-[1.35rem] font-semibold tracking-tight text-sidebar-primary",
            collapsed && "text-lg",
          )}
          aria-label="Talos dashboard"
        >
          {collapsed ? "T" : "TALOS"}
        </Link>
      </div>

      <nav
        className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4"
        aria-label="Operator navigation"
      >
        {adminNavSections.map((section) => (
          <div key={section.id}>
            {!collapsed && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                        collapsed && "justify-center px-2",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {onCollapsedChange ? (
        <div className="shrink-0 border-t border-sidebar-border p-2.5">
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12px] font-medium text-sidebar-muted transition-colors",
              "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed && "justify-center px-2",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
