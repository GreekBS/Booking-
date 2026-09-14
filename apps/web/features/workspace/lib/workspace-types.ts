import type {
  WorkspaceBlockTarget,
  WorkspaceBookingTarget,
  WorkspaceHoldTarget,
} from "@/features/extranet-calendar/types";

export type WorkspaceMode = "idle" | "date-edit" | "booking" | "hold" | "block";

export type EntityWorkspaceMode = Extract<WorkspaceMode, "booking" | "hold" | "block">;

export type WorkspaceSessionStatus = "clean" | "dirty" | "saving" | "error";

export interface WorkspacePayload {
  booking?: WorkspaceBookingTarget;
  hold?: WorkspaceHoldTarget;
  block?: WorkspaceBlockTarget;
}

export interface WorkspaceState {
  open: boolean;
  mode: WorkspaceMode;
  payload: WorkspacePayload | null;
}

export interface WorkspaceEditorHandle {
  getSession: () => WorkspaceSessionStatus;
  getCanSave?: () => boolean;
  onSave?: () => Promise<void>;
  onDiscard?: () => void;
}

export function isEntityWorkspaceMode(mode: WorkspaceMode): mode is EntityWorkspaceMode {
  return mode === "booking" || mode === "hold" || mode === "block";
}
