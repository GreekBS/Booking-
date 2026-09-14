"use client";

import { useEffect } from "react";
import type { WorkspaceEditorHandle, WorkspaceSessionStatus } from "../lib/workspace-types";
import { useWorkspace } from "../context/WorkspaceContext";

interface UseWorkspaceEditorSessionOptions {
  onSave?: () => Promise<void>;
  onDiscard?: () => void;
  canSave?: boolean;
}

export function useWorkspaceEditorSession(
  sessionStatus: WorkspaceSessionStatus,
  options: UseWorkspaceEditorSessionOptions = {},
) {
  const { registerEditor, setSessionStatus } = useWorkspace();
  const { onSave, onDiscard, canSave = false } = options;

  useEffect(() => {
    const handle: WorkspaceEditorHandle = {
      getSession: () => sessionStatus,
      getCanSave: () => canSave,
      onSave,
      onDiscard,
    };

    registerEditor(handle);
    return () => registerEditor(null);
  }, [registerEditor, sessionStatus, onSave, onDiscard, canSave]);

  useEffect(() => {
    setSessionStatus(sessionStatus);
  }, [sessionStatus, setSessionStatus]);
}
