import {
  WORKSPACE_WIDTH_DEFAULT_PX,
  WORKSPACE_WIDTH_MAX_VW,
  WORKSPACE_WIDTH_MIN_PX,
  WORKSPACE_WIDTH_STORAGE_KEY,
} from "./workspace-constants";

export function clampWorkspaceWidth(width: number, viewportWidth: number): number {
  const maxPx = Math.floor(viewportWidth * (WORKSPACE_WIDTH_MAX_VW / 100));
  return Math.min(Math.max(width, WORKSPACE_WIDTH_MIN_PX), maxPx);
}

export function readStoredWorkspaceWidth(viewportWidth: number): number {
  if (typeof window === "undefined") {
    return WORKSPACE_WIDTH_DEFAULT_PX;
  }

  try {
    const raw = localStorage.getItem(WORKSPACE_WIDTH_STORAGE_KEY);
    if (raw == null) {
      return clampWorkspaceWidth(WORKSPACE_WIDTH_DEFAULT_PX, viewportWidth);
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      return clampWorkspaceWidth(WORKSPACE_WIDTH_DEFAULT_PX, viewportWidth);
    }
    return clampWorkspaceWidth(parsed, viewportWidth);
  } catch {
    return clampWorkspaceWidth(WORKSPACE_WIDTH_DEFAULT_PX, viewportWidth);
  }
}

export function writeStoredWorkspaceWidth(width: number): void {
  try {
    localStorage.setItem(WORKSPACE_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}
