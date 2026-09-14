"use client";

import { useCallback, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { adminFetch } from "@/lib/admin/api";
import type { BookingRecord } from "@/lib/admin/types";
import { toastError, toastSuccess } from "@/lib/admin/toast";

export function useBookingActions(onUpdated?: (booking: BookingRecord) => void) {
  const { tenantId } = useTenant();
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const confirmBooking = useCallback(
    async (booking: BookingRecord) => {
      if (!tenantId) return null;
      setActionLoading(true);
      try {
        const updated = await adminFetch<BookingRecord>(`/bookings/${booking.id}/confirm`, {
          method: "POST",
          tenantId,
        });
        onUpdated?.(updated);
        toastSuccess("Booking confirmed");
        setConfirmOpen(false);
        return updated;
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Confirm failed");
        return null;
      } finally {
        setActionLoading(false);
      }
    },
    [tenantId, onUpdated],
  );

  const cancelBooking = useCallback(
    async (booking: BookingRecord) => {
      if (!tenantId) return null;
      setActionLoading(true);
      try {
        const updated = await adminFetch<BookingRecord>(`/bookings/${booking.id}/cancel`, {
          method: "POST",
          tenantId,
          body: JSON.stringify({ reason: "Cancelled from admin panel" }),
        });
        onUpdated?.(updated);
        toastSuccess("Booking cancelled");
        setCancelOpen(false);
        return updated;
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Cancel failed");
        return null;
      } finally {
        setActionLoading(false);
      }
    },
    [tenantId, onUpdated],
  );

  return {
    actionLoading,
    confirmOpen,
    cancelOpen,
    setConfirmOpen,
    setCancelOpen,
    confirmBooking,
    cancelBooking,
  };
}
