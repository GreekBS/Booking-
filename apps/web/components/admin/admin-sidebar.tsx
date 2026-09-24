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
} from "lucide-react";
import { cn } from "@/lib/utils";

export const adminNavItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/properties", label: "Properties", icon: Building2 },
  { href: "/dashboard/units", label: "Units", icon: DoorOpen },
  { href: "/dashboard/availability", label: "Availability", icon: CalendarDays },
  { href: "/dashboard/pricing", label: "Pricing", icon: DollarSign },
  { href: "/dashboard/bookings", label: "Bookings", icon: BookOpen },
  { href: "/dashboard/payments", label: "Payments", icon: Wallet },
  { href: "/dashboard/fiscal-documents", label: "Fiscal docs", icon: DollarSign },
  { href: "/dashboard/channels", label: "Channels", icon: Network },
  { href: "/dashboard/guests", label: "Guests", icon: Users },
  { href: "/dashboard/members", label: "Members", icon: UserCog },
  { href: "/dashboard/amenities", label: "Amenities", icon: Sparkles },
  { href: "/dashboard/policies", label: "Policies", icon: Shield },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function isNavActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface AdminSidebarProps {
  pathname: string;
  collapsed?: boolean;
}

export function AdminSidebar({ pathname, collapsed }: AdminSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-2")}>
        {!collapsed && (
          <Link href="/dashboard" className="font-semibold tracking-tight">
            HCP Admin
          </Link>
        )}
        {collapsed && <span className="text-sm font-bold">H</span>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
