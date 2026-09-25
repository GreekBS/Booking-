"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TenantProvider } from "@/hooks/use-tenant";
import { ActivePropertyProvider } from "@/hooks/use-active-property";
import {
  AdminSidebar,
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "./admin-sidebar";
import { AdminHeader } from "./admin-header";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  function handleCollapsedChange(next: boolean) {
    setCollapsed(next);
    writeSidebarCollapsed(next);
  }

  return (
    <TenantProvider>
      <ActivePropertyProvider>
        <div className="flex min-h-screen bg-background font-sans">
          <div className="hidden h-screen sticky top-0 lg:block">
            <AdminSidebar
              pathname={pathname}
              collapsed={collapsed}
              onCollapsedChange={handleCollapsedChange}
            />
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent
              side="left"
              className="w-[248px] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
            >
              <AdminSidebar
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            <AdminHeader onMenuClick={() => setMobileOpen(true)} />
            <main className={cn("flex-1 overflow-y-auto p-4 md:p-5 lg:p-6")}>
              {children}
            </main>
          </div>
        </div>
      </ActivePropertyProvider>
    </TenantProvider>
  );
}
