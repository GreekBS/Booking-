"use client";

import { EmptyState } from "@/components/admin/empty-state";

type EmptyVariant =
  | "no-property-selected"
  | "no-units-in-property"
  | "no-unit-selected"
  | "no-search-results";

const COPY: Record<EmptyVariant, { title: string; description: string }> = {
  "no-property-selected": {
    title: "Επιλέξτε ενεργό κατάλυμα",
    description:
      "Επιλέξτε κατάλυμα από τον έλεγχο ενεργού καταλύματος στην κεφαλίδα.",
  },
  "no-unit-selected": {
    title: "Επιλέξτε μονάδα",
    description: "Επιλέξτε μονάδα από τη γραμμή εργαλείων για το μηνιαίο ημερολόγιο.",
  },
  "no-search-results": {
    title: "Δεν βρέθηκαν μονάδες",
    description: "Δοκιμάστε άλλο όνομα ή καθαρίστε την αναζήτηση.",
  },
  "no-units-in-property": {
    title: "Δεν υπάρχουν μονάδες",
    description: "Προσθέστε μονάδες στο κατάλυμα για διαχείριση διαθεσιμότητας.",
  },
};

export function TimelineGridEmptyState({ variant }: { variant: EmptyVariant }) {
  const { title, description } = COPY[variant];

  return (
    <div className="flex justify-center px-4 py-10">
      <EmptyState title={title} description={description} compact className="w-full max-w-md" />
    </div>
  );
}
