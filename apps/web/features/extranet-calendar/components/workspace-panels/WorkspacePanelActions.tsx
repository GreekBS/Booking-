"use client";

import { cn } from "@/lib/utils";

export function WorkspacePanelActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 -mx-4 mt-6 border-t border-border bg-surface px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
