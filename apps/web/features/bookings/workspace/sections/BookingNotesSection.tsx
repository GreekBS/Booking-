"use client";

import { WorkspaceSection } from "@/features/workspace/components/WorkspaceSection";
import { elCommon } from "@/lib/i18n";

/** Notes are not implemented yet — kept de-emphasized under Activity. */
export function BookingNotesSection() {
  return (
    <WorkspaceSection
      title={elCommon.notes}
      badge={
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Σύντομα
        </span>
      }
    >
      <p className="text-xs text-muted-foreground">
        Οι εσωτερικές και οι σημειώσεις επισκέπτη δεν είναι ακόμα διαθέσιμες.
      </p>
    </WorkspaceSection>
  );
}
