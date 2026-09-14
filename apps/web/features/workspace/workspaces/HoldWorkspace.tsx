"use client";

import { HoldWorkspacePanel } from "@/features/extranet-calendar/components/workspace-panels/HoldWorkspacePanel";
import type { WorkspaceHoldTarget } from "@/features/extranet-calendar/types";

interface HoldWorkspaceProps {
  target: WorkspaceHoldTarget;
  active: boolean;
}

export function HoldWorkspace({ target, active }: HoldWorkspaceProps) {
  return <HoldWorkspacePanel target={target} active={active} />;
}
