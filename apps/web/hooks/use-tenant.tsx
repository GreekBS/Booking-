"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ErrorState } from "@/components/admin/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { adminFetch } from "@/lib/admin/api";
import type { MeProfile } from "@/lib/admin/types";

const NO_TENANT_MESSAGE =
  "No active tenant. Super admins must impersonate a tenant from Platform Admin first.";

export function renderTenantGate(
  state: { loading: boolean; error: string | null; tenantId: string | null },
  options?: { skeletonClassName?: string },
): React.ReactNode | null {
  if (state.loading) {
    return <Skeleton className={options?.skeletonClassName ?? "h-96 w-full"} />;
  }
  if (state.error) {
    return <ErrorState message={state.error} />;
  }
  if (!state.tenantId) {
    return <ErrorState title="No tenant context" message={NO_TENANT_MESSAGE} />;
  }
  return null;
}

interface TenantContextValue {
  profile: MeProfile | null;
  tenantId: string | null;
  tenantName: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<MeProfile>("/me");
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  const switchTenant = useCallback(async (tenantId: string) => {
    await adminFetch<{ activeTenantId: string }>("/me", {
      method: "PATCH",
      body: JSON.stringify({ activeTenantId: tenantId }),
    });
    await refresh();
    window.location.reload();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tenantId = profile?.activeTenantId ?? profile?.memberships?.[0]?.tenantId ?? null;
  const tenantName =
    profile?.memberships.find((m) => m.tenantId === tenantId)?.tenantName ?? "Tenant";

  const value = useMemo(
    () => ({
      profile,
      tenantId,
      tenantName,
      loading,
      error,
      refresh,
      switchTenant,
    }),
    [profile, tenantId, tenantName, loading, error, refresh, switchTenant],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}
