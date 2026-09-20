"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PlatformSidebar } from "./PlatformSidebar";
import { PlatformHeader } from "./PlatformHeader";
import {
  platformPageTitle,
  type PlatformEnvironment,
} from "./nav";
import "./platform.css";

type Props = {
  children: React.ReactNode;
  environment: PlatformEnvironment;
};

export function PlatformShell({ children, environment }: Props) {
  const pathname = usePathname() ?? "/platform";
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = platformPageTitle(pathname);

  return (
    <div className="platform-shell flex min-h-screen bg-[var(--platform-canvas)] text-[var(--platform-ink)]">
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <PlatformSidebar pathname={pathname} />
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-56 border-0 p-0 sm:max-w-none">
          <PlatformSidebar
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <PlatformHeader
          title={title}
          environment={environment}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-7">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
