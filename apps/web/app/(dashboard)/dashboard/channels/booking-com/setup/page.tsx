"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { beginBookingComSetup, formatBookingComApiError } from "@/features/channels/booking-com/booking-com-api";

export default function BookingComSetupEntryPage() {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await beginBookingComSetup(tenantId, {
          displayName: "Booking.com",
        });
        if (!cancelled) {
          router.replace(
            `/dashboard/channels/${result.connection.connectionId}/setup`,
          );
        }
      } catch (err) {
        if (!cancelled) setError(formatBookingComApiError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, router]);

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Connect Booking.com" description="Starting setup…" />
        <ErrorState message={error} />
      </div>
    );
  }
  return <Skeleton className="h-96 w-full" />;
}
