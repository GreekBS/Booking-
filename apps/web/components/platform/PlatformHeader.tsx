"use client";

import { LogOut, Menu } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import type { PlatformEnvironment } from "./nav";

type Props = {
  title: string;
  environment: PlatformEnvironment;
  onMenuClick?: () => void;
};

export function PlatformHeader({ title, environment, onMenuClick }: Props) {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const name = session?.user?.name ?? null;

  return (
    <header className="flex h-14 items-center gap-3 border-b border-[var(--platform-border)] bg-white px-4 lg:px-6">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--platform-border)] text-[var(--platform-ink)] lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-[var(--platform-ink)]">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {environment === "production" ? (
          <span className="rounded border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
            Production
          </span>
        ) : (
          <span className="rounded border border-[var(--platform-border)] bg-[var(--platform-muted-bg)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--platform-muted)]">
            {environment}
          </span>
        )}

        {email ? (
          <div className="hidden max-w-[14rem] truncate text-right sm:block">
            <p className="truncate text-xs font-medium text-[var(--platform-ink)]">
              {name ?? "Platform admin"}
            </p>
            <p className="truncate text-[11px] text-[var(--platform-muted)]">
              {email}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--platform-border)] px-2.5 text-xs font-medium text-[var(--platform-ink-soft)] hover:bg-[var(--platform-muted-bg)]"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
