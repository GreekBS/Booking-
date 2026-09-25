"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { WORKSPACE_TRANSITION_MS } from "../lib/workspace-constants";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";
import { shouldShowWorkspaceClose, WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceFooter } from "./WorkspaceFooter";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import type { WorkspaceMode, WorkspaceSessionStatus } from "../lib/workspace-types";

interface WorkspaceShellProps {
  mode: WorkspaceMode;
  sessionStatus: WorkspaceSessionStatus;
  isDocked: boolean;
  open: boolean;
  width: number;
  resizable: boolean;
  onResizeStart: (clientX: number) => void;
  onClose?: () => void;
  onFooterSave?: () => void;
  onFooterCancel?: () => void;
  children: ReactNode;
  /** When true, hides generic header (booking workspace owns header). */
  hideDefaultHeader?: boolean;
  /** When true, hides generic footer. */
  hideDefaultFooter?: boolean;
  /** @deprecated Use hideDefaultHeader and hideDefaultFooter instead. */
  hideDefaultChrome?: boolean;
  contentClassName?: string;
}

export function WorkspaceShell({
  mode,
  sessionStatus,
  isDocked,
  open,
  width,
  resizable,
  onResizeStart,
  onClose,
  onFooterSave,
  onFooterCancel,
  children,
  hideDefaultHeader = false,
  hideDefaultFooter = false,
  hideDefaultChrome = false,
  contentClassName,
}: WorkspaceShellProps) {
  const hideHeader = hideDefaultChrome || hideDefaultHeader;
  const hideFooter = hideDefaultChrome || hideDefaultFooter;
  const showClose = !hideHeader && (!isDocked || shouldShowWorkspaceClose(mode));

  return (
    <>
      {!isDocked && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-30 bg-black/0 transition-colors",
            open && "pointer-events-auto bg-black/20",
          )}
          style={{ transitionDuration: `${WORKSPACE_TRANSITION_MS}ms` }}
          onClick={onClose}
          aria-hidden={!open}
        />
      )}

      <aside
        className={cn(
          "relative flex flex-col border-l border-border bg-surface",
          isDocked
            ? "min-h-0 shrink-0 self-stretch"
            : cn(
                "absolute inset-y-0 right-0 z-40 transition-transform ease-out",
                open ? "translate-x-0" : "translate-x-full pointer-events-none",
              ),
        )}
        data-workspace-area
        style={{
          width,
          transitionDuration: isDocked ? undefined : `${WORKSPACE_TRANSITION_MS}ms`,
        }}
        aria-hidden={isDocked ? false : !open}
        role={isDocked ? "complementary" : "dialog"}
        aria-modal={isDocked ? undefined : open}
        aria-label={mode === "date-edit" ? "Date editor" : "Workspace"}
        onClick={(event) => event.stopPropagation()}
      >
        {resizable && <WorkspaceResizeHandle onResizeStart={onResizeStart} />}

        {!hideHeader && (
          <WorkspaceHeader mode={mode} onClose={onClose} showClose={showClose} />
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto",
              hideHeader ? "overflow-hidden p-0" : "px-4 py-4",
              contentClassName,
            )}
          >
            {children}
          </div>
          {!hideFooter && (
            <WorkspaceFooter
              sessionStatus={sessionStatus}
              onSave={onFooterSave}
              onCancel={onFooterCancel}
            />
          )}
        </div>
      </aside>

      <UnsavedChangesDialog />
    </>
  );
}
