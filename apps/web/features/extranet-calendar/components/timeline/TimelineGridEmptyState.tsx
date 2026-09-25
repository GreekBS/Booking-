"use client";

import { EmptyState } from "@/components/admin/empty-state";

type EmptyVariant =
  | "no-property-selected"
  | "no-units-in-property"
  | "no-unit-selected"
  | "no-search-results";

const COPY: Record<EmptyVariant, { title: string; description: string }> = {
  "no-property-selected": {
    title: "Select an Active Property",
    description:
      "Choose a property from the header Active Property control to open its calendar workspace.",
  },
  "no-unit-selected": {
    title: "Select a unit",
    description: "Choose a unit from the calendar toolbar to view its month calendar.",
  },
  "no-search-results": {
    title: "No units match your search",
    description: "Try a different unit name or clear the search field.",
  },
  "no-units-in-property": {
    title: "No units in this property",
    description: "Add units to this property to manage availability on the calendar.",
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
