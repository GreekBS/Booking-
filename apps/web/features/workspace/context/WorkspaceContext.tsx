"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  EntityWorkspaceMode,
  WorkspaceEditorHandle,
  WorkspacePayload,
  WorkspaceSessionStatus,
  WorkspaceState,
} from "../lib/workspace-types";

type PendingNavigation =
  | { kind: "workspace"; next: WorkspaceState }
  | { kind: "action"; proceed: () => void };

interface WorkspaceContextValue {
  workspace: WorkspaceState;
  sessionStatus: WorkspaceSessionStatus;
  editorCanSave: boolean;
  unsavedDialogOpen: boolean;
  openWorkspace: (mode: EntityWorkspaceMode, payload?: WorkspacePayload) => void;
  openDateWorkspace: () => void;
  closeWorkspace: () => void;
  registerEditor: (handle: WorkspaceEditorHandle | null) => void;
  setSessionStatus: (status: WorkspaceSessionStatus) => void;
  confirmDiscard: () => void;
  confirmSave: () => Promise<void>;
  cancelNavigation: () => void;
  discardEdits: () => void;
  requestClose: (proceed: () => void) => boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const INITIAL_WORKSPACE: WorkspaceState = {
  open: false,
  mode: "date-edit",
  payload: null,
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceState>(INITIAL_WORKSPACE);
  const [sessionStatus, setSessionStatusState] = useState<WorkspaceSessionStatus>("clean");
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [editorCanSave, setEditorCanSave] = useState(false);

  const editorRef = useRef<WorkspaceEditorHandle | null>(null);

  const getActiveSession = useCallback((): WorkspaceSessionStatus => {
    return editorRef.current?.getSession() ?? sessionStatus;
  }, [sessionStatus]);

  const applyNavigation = useCallback((next: WorkspaceState) => {
    setWorkspace(next);
    setSessionStatusState("clean");
  }, []);

  const requestNavigation = useCallback(
    (next: WorkspaceState): boolean => {
      const activeSession = getActiveSession();

      if (activeSession === "saving") {
        return false;
      }

      if (activeSession === "dirty" || activeSession === "error") {
        setPendingNavigation({ kind: "workspace", next });
        setUnsavedDialogOpen(true);
        return false;
      }

      applyNavigation(next);
      return true;
    },
    [applyNavigation, getActiveSession],
  );

  const openWorkspace = useCallback(
    (mode: EntityWorkspaceMode, payload?: WorkspacePayload) => {
      requestNavigation({
        open: true,
        mode,
        payload: payload ?? null,
      });
    },
    [requestNavigation],
  );

  const openDateWorkspace = useCallback(() => {
    requestNavigation({
      open: true,
      mode: "date-edit",
      payload: null,
    });
  }, [requestNavigation]);

  const closeWorkspace = useCallback(() => {
    requestNavigation({
      open: false,
      mode: "date-edit",
      payload: null,
    });
  }, [requestNavigation]);

  const registerEditor = useCallback((handle: WorkspaceEditorHandle | null) => {
    editorRef.current = handle;
    setEditorCanSave(handle ? (handle.getCanSave?.() ?? Boolean(handle.onSave)) : false);
    if (handle) {
      setSessionStatusState(handle.getSession());
    } else {
      setSessionStatusState("clean");
    }
  }, []);

  const setSessionStatus = useCallback((status: WorkspaceSessionStatus) => {
    setSessionStatusState(status);
  }, []);

  const completePendingNavigation = useCallback(() => {
    if (!pendingNavigation) {
      return;
    }

    if (pendingNavigation.kind === "workspace") {
      applyNavigation(pendingNavigation.next);
    } else {
      pendingNavigation.proceed();
    }

    setPendingNavigation(null);
    setUnsavedDialogOpen(false);
  }, [applyNavigation, pendingNavigation]);

  const confirmDiscard = useCallback(() => {
    if (!pendingNavigation) {
      setUnsavedDialogOpen(false);
      return;
    }

    editorRef.current?.onDiscard?.();
    completePendingNavigation();
  }, [completePendingNavigation, pendingNavigation]);

  const confirmSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor?.onSave) {
      return;
    }

    setSessionStatusState("saving");
    try {
      await editor.onSave();
      setSessionStatusState("clean");
      if (!pendingNavigation) {
        setUnsavedDialogOpen(false);
        return;
      }
      completePendingNavigation();
    } catch {
      setSessionStatusState("error");
    }
  }, [completePendingNavigation, pendingNavigation]);

  const discardEdits = useCallback(() => {
    editorRef.current?.onDiscard?.();
  }, []);

  const requestClose = useCallback(
    (proceed: () => void): boolean => {
      const activeSession = getActiveSession();

      if (activeSession === "saving") {
        return false;
      }

      if (activeSession === "dirty" || activeSession === "error") {
        setPendingNavigation({ kind: "action", proceed });
        setUnsavedDialogOpen(true);
        return false;
      }

      proceed();
      return true;
    },
    [getActiveSession],
  );

  const cancelNavigation = useCallback(() => {
    setPendingNavigation(null);
    setUnsavedDialogOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      workspace,
      sessionStatus: getActiveSession(),
      editorCanSave,
      unsavedDialogOpen,
      openWorkspace,
      openDateWorkspace,
      closeWorkspace,
      registerEditor,
      setSessionStatus,
      confirmDiscard,
      confirmSave,
      cancelNavigation,
      discardEdits,
      requestClose,
    }),
    [
      workspace,
      getActiveSession,
      editorCanSave,
      unsavedDialogOpen,
      openWorkspace,
      openDateWorkspace,
      closeWorkspace,
      registerEditor,
      setSessionStatus,
      confirmDiscard,
      confirmSave,
      cancelNavigation,
      discardEdits,
      requestClose,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
