"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TenantProvider } from "@/hooks/use-tenant";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <TenantProvider>
      <div className="flex min-h-screen bg-background">
        <div className="hidden lg:block">
          <AdminSidebar pathname={pathname} />
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <AdminSidebar pathname={pathname} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <AdminHeader onMenuClick={() => setMobileOpen(true)} />
          <main className={cn("flex-1 overflow-y-auto p-4 md:p-6 lg:p-8")}>{children}</main>
        </div>
      </div>
    </TenantProvider>
  );
}
