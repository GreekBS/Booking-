"use client";

import { cn } from "@/lib/utils";

interface WorkspaceResizeHandleProps {
  onResizeStart: (clientX: number) => void;
  className?: string;
}

export function WorkspaceResizeHandle({ onResizeStart, className }: WorkspaceResizeHandleProps) {
  return (
    <button
      type="button"
      aria-label="Resize workspace"
      className={cn(
        "absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none border-0 bg-transparent p-0",
        "hover:bg-[#d1d5db]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-border/60",
        className,
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        onResizeStart(event.clientX);
      }}
    />
  );
}
