"use client";

import { ManualDateEditForm } from "@/features/extranet-calendar/components/workspace-editors/ManualDateEditForm";
import type { RackUnit } from "@/features/extranet-calendar/types";

interface DateWorkspaceProps {
  units: RackUnit[];
  selectedUnitId: string | null;
}

export function DateWorkspace({ units, selectedUnitId }: DateWorkspaceProps) {
  return <ManualDateEditForm units={units} selectedUnitId={selectedUnitId} />;
}
