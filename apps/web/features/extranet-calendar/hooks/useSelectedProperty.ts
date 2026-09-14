"use client";

import { useCallback, useEffect, useState } from "react";
import { SELECTED_PROPERTY_STORAGE_KEY } from "../constants";

function storageKey(tenantId: string | null): string {
  return `${SELECTED_PROPERTY_STORAGE_KEY}:${tenantId ?? "none"}`;
}

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function resolveSelection(
  propertyIds: string[],
  current: string | null,
  key: string,
): string | null {
  if (propertyIds.length === 0) return null;
  if (current && propertyIds.includes(current)) return current;
  const stored = readStored(key);
  if (stored && propertyIds.includes(stored)) return stored;
  return propertyIds[0]!;
}

export function useSelectedProperty(tenantId: string | null, propertyIds: string[]) {
  const key = storageKey(tenantId);
  const [selectedPropertyId, setSelectedPropertyIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSelectedPropertyIdState((current) => resolveSelection(propertyIds, current, key));
    setReady(true);
  }, [key, propertyIds]);

  const setSelectedPropertyId = useCallback(
    (propertyId: string) => {
      setSelectedPropertyIdState(propertyId);
      try {
        sessionStorage.setItem(key, propertyId);
      } catch {
        /* ignore quota errors */
      }
    },
    [key],
  );

  return { selectedPropertyId, setSelectedPropertyId, ready };
}
