"use client";

import { useCallback, useEffect, useState } from "react";
import { SELECTED_UNIT_STORAGE_KEY } from "../constants";

function storageKey(tenantId: string | null, propertyId: string | null): string {
  return `${SELECTED_UNIT_STORAGE_KEY}:${tenantId ?? "none"}:${propertyId ?? "none"}`;
}

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function resolveSelection(unitIds: string[], current: string | null, key: string): string | null {
  if (unitIds.length === 0) return null;
  if (current && unitIds.includes(current)) return current;
  const stored = readStored(key);
  if (stored && unitIds.includes(stored)) return stored;
  return unitIds[0]!;
}

export function useSelectedUnit(
  tenantId: string | null,
  propertyId: string | null,
  unitIds: string[],
) {
  const key = storageKey(tenantId, propertyId);
  const [selectedUnitId, setSelectedUnitIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSelectedUnitIdState((current) => resolveSelection(unitIds, current, key));
    setReady(true);
  }, [key, unitIds]);

  const setSelectedUnitId = useCallback(
    (unitId: string) => {
      setSelectedUnitIdState(unitId);
      try {
        sessionStorage.setItem(key, unitId);
      } catch {
        /* ignore quota errors */
      }
    },
    [key],
  );

  return { selectedUnitId, setSelectedUnitId, ready };
}
