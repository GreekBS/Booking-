"use client";

import { CalendarDays, Home, Lock, Sparkles, Unlock, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarSelection } from "../types";
import { formatSelectionLabel } from "../lib/selection-utils";
import { addDaysIso } from "../lib/calendar-utils";
import type { OperatorBlockType } from "@/lib/admin/types";

interface SelectionActionBarProps {
  selection: CalendarSelection;
  unitLabel: string;
  isDragging: boolean;
  onBlock: () => void;
  onOpen: () => void;
  onBlockType: (type: OperatorBlockType) => void;
  onMinStay: () => void;
  onCancel: () => void;
  className?: string;
}

export function SelectionActionBar({
  selection,
  unitLabel,
  isDragging,
  onBlock,
  onOpen,
  onBlockType,
  onMinStay,
  onCancel,
  className,
}: SelectionActionBarProps) {
  const label = formatSelectionLabel(selection, addDaysIso);

  return (
    <div
      className={cn(
        "sticky bottom-0 z-40 flex flex-wrap items-center gap-2 border-t bg-background/95 px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/90",
        isDragging && "border-primary/40 ring-1 ring-primary/20",
        className,
      )}
      role="toolbar"
      aria-label="Selection actions"
    >
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{unitLabel}</span>
        <span className="mx-1.5 text-muted-foreground">·</span>
        <span className={cn(isDragging && "text-primary")}>{label}</span>
        {isDragging && (
          <span className="ml-2 text-xs text-muted-foreground">(dragging)</span>
        )}
      </div>
      <Button size="sm" variant="secondary" className="h-8" onClick={onBlock} disabled={isDragging}>
        <Lock className="h-3.5 w-3.5" />
        Block
      </Button>
      <Button size="sm" variant="secondary" className="h-8" onClick={onOpen} disabled={isDragging}>
        <Unlock className="h-3.5 w-3.5" />
        Open
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="h-8"
        onClick={() => onBlockType("maintenance")}
        disabled={isDragging}
      >
        <Wrench className="h-3.5 w-3.5" />
        Maint.
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="h-8"
        onClick={() => onBlockType("cleaning")}
        disabled={isDragging}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Clean
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="h-8"
        onClick={() => onBlockType("owner")}
        disabled={isDragging}
      >
        <Home className="h-3.5 w-3.5" />
        Owner
      </Button>
      <Button size="sm" variant="secondary" className="h-8" onClick={onMinStay} disabled={isDragging}>
        Min stay
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
        <X className="h-3.5 w-3.5" />
        Cancel
      </Button>
    </div>
  );
}
