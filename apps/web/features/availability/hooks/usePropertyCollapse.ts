"use client";

import { useCallback, useEffect, useState } from "react";

function storageKey(tenantId: string | null): string {
  return `availability:collapsed:${tenantId ?? "none"}`;
}

function readCollapsed(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

export function usePropertyCollapse(tenantId: string | null) {
  const key = storageKey(tenantId);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsed(readCollapsed(key));
  }, [key]);

  const persist = useCallback(
    (next: Set<string>) => {
      setCollapsed(next);
      try {
        sessionStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        /* ignore quota errors */
      }
    },
    [key],
  );

  const isCollapsed = useCallback((propertyId: string) => collapsed.has(propertyId), [collapsed]);

  const toggle = useCallback(
    (propertyId: string) => {
      const next = new Set(collapsed);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      persist(next);
    },
    [collapsed, persist],
  );

  return { isCollapsed, toggle };
}
