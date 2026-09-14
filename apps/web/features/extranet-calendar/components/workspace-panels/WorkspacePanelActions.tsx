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
        "sticky bottom-0 -mx-4 mt-6 border-t border-[#d1d5db] bg-white px-4 py-3 dark:border-border dark:bg-background",
        className,
      )}
    >
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
