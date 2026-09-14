"use client";

import { Building2, Search } from "lucide-react";

type EmptyVariant =
  | "no-property-selected"
  | "no-units-in-property"
  | "no-unit-selected"
  | "no-search-results";

const COPY: Record<EmptyVariant, { title: string; description: string }> = {
  "no-property-selected": {
    title: "Select a property",
    description: "Choose a property from the selector above to open its calendar workspace.",
  },
  "no-unit-selected": {
    title: "Select a room",
    description: "Choose a room from the selector above to view its month calendar.",
  },
  "no-search-results": {
    title: "No rooms match your search",
    description: "Try a different room name or clear the search field.",
  },
  "no-units-in-property": {
    title: "No units in this property",
    description: "Add units to this property to manage availability on the calendar.",
  },
};

export function TimelineGridEmptyState({ variant }: { variant: EmptyVariant }) {
  const { title, description } = COPY[variant];
  const Icon = variant === "no-search-results" ? Search : Building2;

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
