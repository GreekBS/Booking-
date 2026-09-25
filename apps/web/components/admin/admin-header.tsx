"use client";

import { Bell, LogOut, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTenant } from "@/hooks/use-tenant";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminBreadcrumbs } from "./admin-breadcrumbs";
import { ActivePropertySelector } from "./active-property-selector";

interface AdminHeaderProps {
  onMenuClick?: () => void;
}

export function AdminHeader({ onMenuClick }: AdminHeaderProps) {
  const pathname = usePathname();
  const immersiveCalendar = pathname.startsWith("/dashboard/availability");
  const { data: session } = useSession();
  const { profile, tenantId, switchTenant } = useTenant();
  const user = profile?.user ?? session?.user;
  const initials =
    user?.name?.slice(0, 2).toUpperCase() ??
    user?.email?.slice(0, 2).toUpperCase() ??
    "U";
  const multiTenant = Boolean(profile && profile.memberships.length > 1);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4 lg:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile: Active Property is primary workspace context */}
      <div className="min-w-0 flex-1 sm:hidden">
        <ActivePropertySelector alwaysVisible compact className="w-full max-w-none" />
      </div>

      <div className="hidden min-w-0 flex-1 md:block">
        {!immersiveCalendar && <AdminBreadcrumbs />}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {multiTenant && (
          <Select value={tenantId ?? undefined} onValueChange={(value) => void switchTenant(value)}>
            <SelectTrigger
              className="hidden h-9 w-[160px] border-border bg-surface text-xs sm:flex"
              aria-label="Switch tenant"
            >
              <SelectValue placeholder="Tenant" />
            </SelectTrigger>
            <SelectContent>
              {profile!.memberships.map((m) => (
                <SelectItem key={m.tenantId} value={m.tenantId}>
                  {m.tenantName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label="Notifications (coming soon)"
          disabled
        >
          <Bell className="h-4 w-4" />
        </Button>

        {/* Desktop / tablet property switcher */}
        <div className="hidden sm:block">
          <ActivePropertySelector />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 rounded-full"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary-subtle text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name ?? "User"}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            {multiTenant ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:hidden">
                  Workspace
                </DropdownMenuLabel>
                <div className="px-2 pb-2 sm:hidden">
                  <Select
                    value={tenantId ?? undefined}
                    onValueChange={(value) => void switchTenant(value)}
                  >
                    <SelectTrigger className="h-9 w-full text-xs" aria-label="Switch tenant">
                      <SelectValue placeholder="Tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {profile!.memberships.map((m) => (
                        <SelectItem key={m.tenantId} value={m.tenantId}>
                          {m.tenantName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
