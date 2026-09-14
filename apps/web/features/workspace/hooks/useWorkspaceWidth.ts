"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WORKSPACE_WIDTH_DEFAULT_PX } from "../lib/workspace-constants";
import {
  clampWorkspaceWidth,
  readStoredWorkspaceWidth,
  writeStoredWorkspaceWidth,
} from "../lib/workspace-storage";

export function useWorkspaceWidth(enabled: boolean) {
  const [width, setWidth] = useState(WORKSPACE_WIDTH_FALLBACK);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      setWidth(readStoredWorkspaceWidth(window.innerWidth));
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [enabled]);

  const startResize = useCallback(
    (clientX: number) => {
      if (!enabled) return;

      const startX = clientX;
      const startWidth = widthRef.current;

      function onPointerMove(event: PointerEvent) {
        const delta = startX - event.clientX;
        const next = clampWorkspaceWidth(startWidth + delta, window.innerWidth);
        setWidth(next);
      }

      function onPointerUp(event: PointerEvent) {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        const delta = startX - event.clientX;
        const next = clampWorkspaceWidth(startWidth + delta, window.innerWidth);
        writeStoredWorkspaceWidth(next);
        setWidth(next);
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [enabled],
  );

  return { width, startResize };
}

const WORKSPACE_WIDTH_FALLBACK = WORKSPACE_WIDTH_DEFAULT_PX;
