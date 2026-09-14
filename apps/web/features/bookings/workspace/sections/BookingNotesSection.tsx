"use client";

import { WorkspaceSection } from "@/features/workspace/components/WorkspaceSection";

export function BookingNotesSection() {
  return (
    <WorkspaceSection
      title="Notes"
      badge={
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming in P3
        </span>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">Internal notes</p>
          <p className="mt-1 text-sm text-muted-foreground">No internal notes yet. Coming in P3.</p>
        </div>
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">Guest notes</p>
          <p className="mt-1 text-sm text-muted-foreground">No guest notes yet. Coming in P3.</p>
        </div>
      </div>
    </WorkspaceSection>
  );
}
