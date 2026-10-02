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
import { BreadcrumbEntityLabelsProvider } from "./breadcrumb-entity-labels";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SHELL_CONTENT_PAD } from "./shell-spacing";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = "el";
    return () => {
      document.documentElement.lang = previous;
    };
  }, []);

  function handleCollapsedChange(next: boolean) {
    setCollapsed(next);
    writeSidebarCollapsed(next);
  }

  return (
    <TenantProvider>
      <ActivePropertyProvider>
        <BreadcrumbEntityLabelsProvider>
        <div className="flex min-h-screen bg-background font-sans">
          <div className="hidden h-screen sticky top-0 lg:block lg:bg-[hsl(var(--sidebar-rail))] lg:pl-3">
            <AdminSidebar
              pathname={pathname}
              collapsed={collapsed}
              onCollapsedChange={handleCollapsedChange}
            />
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent
              side="left"
              className="flex w-[248px] flex-col overflow-hidden border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
            >
              <AdminSidebar
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            <AdminHeader onMenuClick={() => setMobileOpen(true)} />
            <main className={cn("flex-1 overflow-y-auto", SHELL_CONTENT_PAD)}>
              {children}
            </main>
          </div>
        </div>
        </BreadcrumbEntityLabelsProvider>
      </ActivePropertyProvider>
    </TenantProvider>
  );
}
