"use client";

import { useEffect, useState } from "react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { ErrorState } from "@/components/admin/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getChannelConnection, formatChannelApiError } from "./channel-api";
import { IcalChannelDetailPage } from "./IcalChannelDetailPage";
import { BookingComConnectedDashboard } from "./booking-com/BookingComConnectedDashboard";

type Props = { connectionId: string };

/**
 * Provider-aware channel detail entry.
 * Booking.com → operational dashboard; iCal → existing pilot detail.
 */
export function ChannelDetailPage({ connectionId }: Props) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const conn = await getChannelConnection(tenantId, connectionId);
        if (!cancelled) setProvider(conn.provider);
      } catch (err) {
        if (!cancelled) setError(formatChannelApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, connectionId]);

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} />;

  if (provider === "booking_com") {
    return <BookingComConnectedDashboard connectionId={connectionId} />;
  }

  return <IcalChannelDetailPage connectionId={connectionId} />;
}
