"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type LabelMap = Record<string, string>;

type BreadcrumbEntityLabelsContextValue = {
  labels: LabelMap;
  setEntityLabels: (labels: LabelMap) => void;
};

const BreadcrumbEntityLabelsContext =
  createContext<BreadcrumbEntityLabelsContextValue | null>(null);

/**
 * Optional entity names for UUID path segments in AdminBreadcrumbs.
 * Pages that already loaded a property/guest set labels here — no extra fetch.
 */
export function BreadcrumbEntityLabelsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [labels, setLabels] = useState<LabelMap>({});
  const setEntityLabels = useCallback((next: LabelMap) => {
    setLabels(next);
  }, []);
  const value = useMemo(
    () => ({ labels, setEntityLabels }),
    [labels, setEntityLabels],
  );
  return (
    <BreadcrumbEntityLabelsContext.Provider value={value}>
      {children}
    </BreadcrumbEntityLabelsContext.Provider>
  );
}

export function useBreadcrumbEntityLabelsContext(): BreadcrumbEntityLabelsContextValue {
  const ctx = useContext(BreadcrumbEntityLabelsContext);
  if (!ctx) {
    return {
      labels: {},
      setEntityLabels: () => undefined,
    };
  }
  return ctx;
}

/**
 * Publish breadcrumb labels for the current page lifecycle.
 * Keys are path segments (typically entity UUIDs or last segments like `assistant`).
 */
export function useBreadcrumbEntityLabels(labels: LabelMap): void {
  const { setEntityLabels } = useBreadcrumbEntityLabelsContext();
  const serialized = JSON.stringify(labels);
  useEffect(() => {
    const parsed = JSON.parse(serialized) as LabelMap;
    setEntityLabels(parsed);
    return () => setEntityLabels({});
  }, [serialized, setEntityLabels]);
}
