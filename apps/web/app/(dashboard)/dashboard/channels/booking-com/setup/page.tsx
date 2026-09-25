"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { beginBookingComSetup, formatBookingComApiError } from "@/features/channels/booking-com/booking-com-api";

export default function BookingComSetupEntryPage() {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !propertyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await beginBookingComSetup(tenantId, {
          displayName: "Booking.com",
          workspacePropertyId: propertyId,
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
  }, [tenantId, propertyId, router]);

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (propertyGate) return propertyGate;

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
