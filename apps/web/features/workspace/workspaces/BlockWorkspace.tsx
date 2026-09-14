"use client";

import { BlockWorkspacePanel } from "@/features/extranet-calendar/components/workspace-panels/BlockWorkspacePanel";
import type { WorkspaceBlockTarget } from "@/features/extranet-calendar/types";

interface BlockWorkspaceProps {
  target: WorkspaceBlockTarget;
  active: boolean;
}

export function BlockWorkspace({ target, active }: BlockWorkspaceProps) {
  return <BlockWorkspacePanel target={target} active={active} />;
}
