"use client";

import { WorkspaceSection } from "@/features/workspace/components/WorkspaceSection";
import { elCommon } from "@/lib/i18n";

/** Notes are not implemented yet — kept de-emphasized under Activity. */
export function BookingNotesSection() {
  return (
    <WorkspaceSection
      title={elCommon.notes}
      badge={
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground/70">
          Σύντομα
        </span>
      }
    >
      <p className="text-sm text-foreground/70">
        Οι εσωτερικές και οι σημειώσεις επισκέπτη δεν είναι ακόμα διαθέσιμες.
      </p>
    </WorkspaceSection>
  );
}
