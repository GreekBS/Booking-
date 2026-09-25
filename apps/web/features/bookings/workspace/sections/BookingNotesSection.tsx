"use client";

import { WorkspaceSection } from "@/features/workspace/components/WorkspaceSection";

/** Notes are not implemented yet — kept de-emphasized under Activity. */
export function BookingNotesSection() {
  return (
    <WorkspaceSection
      title="Notes"
      badge={
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Future
        </span>
      }
    >
      <p className="text-xs text-muted-foreground">
        Internal and guest notes are not available yet.
      </p>
    </WorkspaceSection>
  );
}
