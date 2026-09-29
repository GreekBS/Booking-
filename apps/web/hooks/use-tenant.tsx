"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ErrorState } from "@/components/admin/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { adminFetch } from "@/lib/admin/api";
import type { MeProfile } from "@/lib/admin/types";

const NO_TENANT_SA_MESSAGE =
  "Δεν υπάρχει ενεργός οργανισμός. Οι διαχειριστές πλατφόρμας πρέπει να επιλέξουν οργανισμό από τη Διαχείριση πλατφόρμας.";

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
    return (
      <ErrorState
        title="Απαιτείται οργανισμός"
        message="Δημιουργήστε οργανισμό για να συνεχίσετε, ή ανοίξτε την ενότητα έναρξης."
      />
    );
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
  const pathname = usePathname();
  const router = useRouter();
  const { update } = useSession();

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

  const switchTenant = useCallback(
    async (nextTenantId: string) => {
      await adminFetch<{ activeTenantId: string }>("/me", {
        method: "PATCH",
        body: JSON.stringify({ activeTenantId: nextTenantId }),
      });
      await update({ activeTenantId: nextTenantId });
      window.location.reload();
    },
    [update],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tenantId = profile?.activeTenantId ?? profile?.memberships?.[0]?.tenantId ?? null;
  const tenantName =
    profile?.memberships.find((m) => m.tenantId === tenantId)?.tenantName ?? "Tenant";
  const isSuperAdmin = profile?.user?.platformRole === "super_admin";
  const needsCustomerOnboarding =
    !loading && !error && !tenantId && !isSuperAdmin && Boolean(profile);

  useEffect(() => {
    if (!needsCustomerOnboarding) return;
    if (pathname?.startsWith("/dashboard/onboarding")) return;
    router.replace("/dashboard/onboarding");
  }, [needsCustomerOnboarding, pathname, router]);

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

  let body: React.ReactNode = children;
  if (needsCustomerOnboarding && !pathname?.startsWith("/dashboard/onboarding")) {
    body = <Skeleton className="h-96 w-full" />;
  } else if (!loading && !tenantId && isSuperAdmin && !pathname?.startsWith("/platform")) {
    body = (
      <ErrorState title="Δεν υπάρχει πλαίσιο οργανισμού" message={NO_TENANT_SA_MESSAGE} />
    );
  }

  return <TenantContext.Provider value={value}>{body}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}
