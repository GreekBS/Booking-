"use client";

import { cn } from "@/lib/utils";
import { SHELL_CONTENT_BLEED } from "@/components/admin/shell-spacing";

/**
 * Cancels dashboard main padding and fills the viewport below the admin header.
 * Bleed must stay in lockstep with SHELL_CONTENT_PAD (AdminShell).
 */
export function ExtranetWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        SHELL_CONTENT_BLEED,
        "h-[calc(100vh-3.5rem)]",
      )}
    >
      {children}
    </div>
  );
}
