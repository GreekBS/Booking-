"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTenant } from "@/hooks/use-tenant";
import {
  fetchPropertyUnitCatalog,
  invalidateActivePropertyScopedCaches,
} from "@/lib/admin/api";
import type { CatalogPropertyRecord } from "@/lib/admin/types";
import {
  activePropertyStorageKey,
  resolveActivePropertyId,
} from "@/lib/admin/active-property";
import { ErrorState } from "@/components/admin/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export {
  ACTIVE_PROPERTY_STORAGE_PREFIX,
  activePropertyStorageKey,
  resolveActivePropertyId,
} from "@/lib/admin/active-property";

function readStoredPropertyId(tenantId: string | null): string | null {
  if (!tenantId || typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(activePropertyStorageKey(tenantId));
  } catch {
    return null;
  }
}

function writeStoredPropertyId(tenantId: string, propertyId: string): void {
  try {
    sessionStorage.setItem(activePropertyStorageKey(tenantId), propertyId);
  } catch {
    /* ignore quota / private mode */
  }
}

export interface ActivePropertyContextValue {
  propertyId: string | null;
  property: CatalogPropertyRecord | null;
  properties: CatalogPropertyRecord[];
  setActiveProperty: (propertyId: string) => void;
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ActivePropertyContext = createContext<ActivePropertyContextValue | null>(
  null,
);

export function ActivePropertyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [properties, setProperties] = useState<CatalogPropertyRecord[]>([]);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setProperties([]);
      setPropertyId(null);
      setReady(true);
      setError(null);
      return;
    }

    setReady(false);
    setError(null);
    try {
      const catalog = await fetchPropertyUnitCatalog(tenantId);
      const accessible = catalog.properties.filter((p) => p.status !== "archived");
      const accessibleIds = accessible.map((p) => p.id);
      const stored = readStoredPropertyId(tenantId);
      const nextId = resolveActivePropertyId(accessibleIds, stored, null);
      setProperties(accessible);
      setPropertyId(nextId);
      if (nextId) {
        writeStoredPropertyId(tenantId, nextId);
      }
    } catch (err) {
      setProperties([]);
      setPropertyId(null);
      setError(err instanceof Error ? err.message : "Failed to load properties");
    } finally {
      setReady(true);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantLoading) return;
    void refresh();
  }, [tenantLoading, refresh]);

  const setActiveProperty = useCallback(
    (nextId: string) => {
      if (!tenantId) return;
      if (!properties.some((p) => p.id === nextId)) return;
      if (nextId === propertyId) return;
      setPropertyId(nextId);
      writeStoredPropertyId(tenantId, nextId);
      invalidateActivePropertyScopedCaches(tenantId);
    },
    [tenantId, properties, propertyId],
  );

  const property = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  const value = useMemo(
    () => ({
      propertyId,
      property,
      properties,
      setActiveProperty,
      ready,
      error,
      refresh,
    }),
    [propertyId, property, properties, setActiveProperty, ready, error, refresh],
  );

  return (
    <ActivePropertyContext.Provider value={value}>
      {children}
    </ActivePropertyContext.Provider>
  );
}

export function useActiveProperty(): ActivePropertyContextValue {
  const ctx = useContext(ActivePropertyContext);
  if (!ctx) {
    throw new Error("useActiveProperty must be used within ActivePropertyProvider");
  }
  return ctx;
}

export function renderActivePropertyGate(
  state: {
    tenantLoading: boolean;
    tenantError: string | null;
    tenantId: string | null;
    propertyReady: boolean;
    propertyError: string | null;
    propertyId: string | null;
    properties: CatalogPropertyRecord[];
  },
  options?: { skeletonClassName?: string },
): React.ReactNode | null {
  if (state.tenantLoading || !state.propertyReady) {
    return <Skeleton className={options?.skeletonClassName ?? "h-96 w-full"} />;
  }
  if (state.tenantError) {
    return <ErrorState message={state.tenantError} />;
  }
  if (!state.tenantId) {
    return (
      <ErrorState
        title="No tenant context"
        message="No active tenant. Super admins must impersonate a tenant from Platform Admin first."
      />
    );
  }
  if (state.propertyError) {
    return <ErrorState message={state.propertyError} />;
  }
  if (state.properties.length === 0 || !state.propertyId) {
    return (
      <ErrorState
        title="No property"
        message="No accessible properties for this tenant. Create a property to continue."
      />
    );
  }
  return null;
}
