"use client";

import { cn } from "@/lib/utils";

/**
 * Cancels dashboard main padding and fills the viewport below the admin header.
 */
export function ExtranetWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        "-m-4 h-[calc(100vh-3.5rem)] md:-m-6 lg:-m-8",
      )}
    >
      {children}
    </div>
  );
}
