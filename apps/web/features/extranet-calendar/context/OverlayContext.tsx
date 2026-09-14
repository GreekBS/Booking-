"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_OVERLAY_TOGGLES,
  type OverlayToggles,
} from "../lib/overlay-types";

interface OverlayContextValue {
  overlays: OverlayToggles;
  setOverlay: (key: keyof OverlayToggles, value: boolean) => void;
  toggleOverlay: (key: keyof OverlayToggles) => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [overlays, setOverlays] = useState<OverlayToggles>(DEFAULT_OVERLAY_TOGGLES);

  const setOverlay = useCallback((key: keyof OverlayToggles, value: boolean) => {
    setOverlays((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const toggleOverlay = useCallback((key: keyof OverlayToggles) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const value = useMemo(
    () => ({ overlays, setOverlay, toggleOverlay }),
    [overlays, setOverlay, toggleOverlay],
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlays() {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error("useOverlays must be used within OverlayProvider");
  }
  return ctx;
}
