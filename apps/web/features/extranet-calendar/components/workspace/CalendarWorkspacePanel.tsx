"use client";

import { blurActiveCalendarCell } from "@/features/extranet-calendar/lib/calendar-focus-utils";
import { useTimelineInteraction } from "@/features/extranet-calendar/context/TimelineInteractionContext";
import type { RackUnit } from "@/features/extranet-calendar/types";
import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { WorkspaceRouter } from "@/features/workspace/components/WorkspaceRouter";
import { WorkspaceShell } from "@/features/workspace/components/WorkspaceShell";
import { useIsLgViewport } from "@/features/workspace/hooks/useIsLgViewport";
import { useWorkspaceWidth } from "@/features/workspace/hooks/useWorkspaceWidth";
import { isEntityWorkspaceMode, type WorkspaceMode } from "@/features/workspace/lib/workspace-types";

function resolveEffectiveMode(mode: WorkspaceMode, isDocked: boolean, open: boolean): WorkspaceMode {
  if (!isDocked && !open) {
    return "idle";
  }
  if (isDocked && mode === "idle") {
    return "date-edit";
  }
  return mode;
}

export function CalendarWorkspacePanel({
  units,
  selectedUnitId,
}: {
  units: RackUnit[];
  selectedUnitId: string | null;
}) {
  const { workspace, sessionStatus, closeWorkspace, confirmSave, discardEdits } = useWorkspace();
  const { clearSelection } = useTimelineInteraction();
  const isLg = useIsLgViewport();
  const isDocked = isLg;
  const { width, startResize } = useWorkspaceWidth(isDocked);

  const { open, mode, payload } = workspace;
  const effectiveMode = resolveEffectiveMode(mode, isDocked, open);
  const entityActive = isEntityWorkspaceMode(effectiveMode);

  function handleClose() {
    clearSelection();
    blurActiveCalendarCell();
    closeWorkspace();
  }

  const mobileWidth = width;
  const panelWidth = isDocked ? width : mobileWidth;

  const isBookingMode = effectiveMode === "booking";

  function handleFooterCancel() {
    if (isBookingMode) {
      discardEdits();
      return;
    }
    handleClose();
  }

  return (
    <WorkspaceShell
      mode={effectiveMode}
      sessionStatus={sessionStatus}
      isDocked={isDocked}
      open={open}
      width={panelWidth}
      resizable={isDocked}
      onResizeStart={startResize}
      onClose={handleClose}
      onFooterSave={() => void confirmSave()}
      onFooterCancel={handleFooterCancel}
      hideDefaultHeader={isBookingMode}
    >
      <WorkspaceRouter
        mode={effectiveMode}
        payload={payload}
        active={entityActive}
        units={units}
        selectedUnitId={selectedUnitId}
      />
    </WorkspaceShell>
  );
}
