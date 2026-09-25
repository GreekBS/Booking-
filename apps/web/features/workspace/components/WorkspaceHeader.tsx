"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceMode } from "../lib/workspace-types";
import { isEntityWorkspaceMode } from "../lib/workspace-types";

const MODE_LABELS: Record<WorkspaceMode, string> = {
  idle: "Workspace",
  "date-edit": "Edit dates",
  booking: "Reservation",
  hold: "Hold",
  block: "Block",
};

const MODE_SUBTITLES: Partial<Record<WorkspaceMode, string>> = {
  booking: "Reservation details",
  hold: "Hold details",
  block: "Block details",
};

interface WorkspaceHeaderProps {
  mode: WorkspaceMode;
  onClose?: () => void;
  showClose: boolean;
  className?: string;
}

export function WorkspaceHeader({ mode, onClose, showClose, className }: WorkspaceHeaderProps) {
  const subtitle = MODE_SUBTITLES[mode];

  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center justify-between border-b border-border bg-surface px-4",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold text-[#111827] dark:text-foreground">
          {MODE_LABELS[mode]}
        </h2>
        {subtitle && (
          <p className="text-[11px] text-[#6b7280] dark:text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {showClose && onClose && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">Close workspace</span>
        </Button>
      )}
    </div>
  );
}

export function shouldShowWorkspaceClose(mode: WorkspaceMode): boolean {
  return isEntityWorkspaceMode(mode);
}
