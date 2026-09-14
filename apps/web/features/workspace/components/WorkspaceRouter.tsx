"use client";

import type { RackUnit } from "@/features/extranet-calendar/types";
import type { WorkspaceMode, WorkspacePayload } from "../lib/workspace-types";
import { BookingWorkspace } from "../workspaces/BookingWorkspace";
import { BlockWorkspace } from "../workspaces/BlockWorkspace";
import { DateWorkspace } from "../workspaces/DateWorkspace";
import { HoldWorkspace } from "../workspaces/HoldWorkspace";
import { IdleWorkspace } from "../workspaces/IdleWorkspace";

export interface WorkspaceRouterProps {
  mode: WorkspaceMode;
  payload: WorkspacePayload | null;
  active: boolean;
  units: RackUnit[];
  selectedUnitId: string | null;
}

export function WorkspaceRouter({
  mode,
  payload,
  active,
  units,
  selectedUnitId,
}: WorkspaceRouterProps) {
  switch (mode) {
    case "idle":
      return <IdleWorkspace />;
    case "date-edit":
      return <DateWorkspace units={units} selectedUnitId={selectedUnitId} />;
    case "booking":
      if (payload?.booking) {
        return (
          <BookingWorkspace target={payload.booking} active={active} units={units} />
        );
      }
      break;
    case "hold":
      if (payload?.hold) {
        return <HoldWorkspace target={payload.hold} active={active} />;
      }
      break;
    case "block":
      if (payload?.block) {
        return <BlockWorkspace target={payload.block} active={active} />;
      }
      break;
  }

  return (
    <p className="text-sm text-muted-foreground">No details available for this item.</p>
  );
}

/** Registry for future extensibility (guest, communication, etc.). */
export const WORKSPACE_MODE_ORDER: WorkspaceMode[] = [
  "idle",
  "date-edit",
  "booking",
  "hold",
  "block",
];
