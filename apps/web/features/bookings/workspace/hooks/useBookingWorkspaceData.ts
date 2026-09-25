"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { fetchBookingDetail, fetchQuote } from "@/lib/admin/api";
import type { BookingRecord, QuoteRecord } from "@/lib/admin/types";
import { toastError } from "@/lib/admin/toast";
import { computeQuoteDiscountTotal } from "../lib/booking-display";

export interface UseBookingWorkspaceDataOptions {
  bookingId: string;
  active: boolean;
}

export interface UseBookingWorkspaceDataResult {
  booking: BookingRecord | null;
  quote: QuoteRecord | null;
  discountTotal: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setBooking: (booking: BookingRecord) => void;
  setQuote: (quote: QuoteRecord | null) => void;
}

export function useBookingWorkspaceData({
  bookingId,
  active,
}: UseBookingWorkspaceDataOptions): UseBookingWorkspaceDataResult {
  const { tenantId } = useTenant();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!tenantId || !active) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const freshBooking = await fetchBookingDetail(tenantId, bookingId);
      if (requestId !== requestIdRef.current) return;

      setBooking(freshBooking);

      const quoteData = await fetchQuote(tenantId, freshBooking.quoteId).catch(() => null);
      if (requestId !== requestIdRef.current) return;

      setQuote(quoteData);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load booking details";
      setError(message);
      toastError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [active, bookingId, tenantId]);

  useEffect(() => {
    if (!active || !tenantId) {
      setBooking(null);
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Clear previous reservation immediately to avoid stale flash on switch.
    setBooking(null);
    setQuote(null);
    setError(null);
    void load();
  }, [active, tenantId, load]);

  const discountTotal = useMemo(() => computeQuoteDiscountTotal(quote), [quote]);

  return {
    booking,
    quote,
    discountTotal,
    loading,
    error,
    refresh: load,
    setBooking,
    setQuote,
  };
}
