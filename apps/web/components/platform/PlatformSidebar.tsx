"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  PLATFORM_NAV_ITEMS,
  isPlatformNavActive,
} from "./nav";

type Props = {
  pathname: string;
  onNavigate?: () => void;
};

export function PlatformSidebar({ pathname, onNavigate }: Props) {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-[var(--platform-border)] bg-[var(--platform-sidebar)] text-[var(--platform-sidebar-fg)]">
      <div className="flex h-14 flex-col justify-center border-b border-white/10 px-4">
        <Link
          href="/platform"
          onClick={onNavigate}
          className="leading-tight"
        >
          <span className="block text-sm font-semibold tracking-tight text-white">
            Talos
          </span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
            Platform
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 p-2" aria-label="Platform">
        {PLATFORM_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isPlatformNavActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--platform-accent)] text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">
          Control Center
        </p>
      </div>
    </aside>
  );
}
