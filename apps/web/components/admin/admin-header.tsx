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
  const initials = user?.name?.slice(0, 2).toUpperCase() ?? user?.email?.slice(0, 2).toUpperCase() ?? "U";

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      <div className="hidden min-w-0 flex-1 md:block">
        {!immersiveCalendar && <AdminBreadcrumbs />}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {profile && profile.memberships.length > 1 && (
          <Select value={tenantId ?? undefined} onValueChange={(value) => void switchTenant(value)}>
            <SelectTrigger className="hidden w-[180px] sm:flex">
              <SelectValue placeholder="Select tenant" />
            </SelectTrigger>
            <SelectContent>
              {profile.memberships.map((m) => (
                <SelectItem key={m.tenantId} value={m.tenantId}>
                  {m.tenantName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="ghost" size="icon" aria-label="Notifications (coming soon)" disabled>
          <Bell className="h-4 w-4" />
        </Button>

        <ActivePropertySelector />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials}</AvatarFallback>
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
