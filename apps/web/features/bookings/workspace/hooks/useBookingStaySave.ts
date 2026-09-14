"use client";

import { useCallback, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { commitBookingStayChange, fetchQuote } from "@/lib/admin/api";
import type { BookingRecord, QuoteRecord } from "@/lib/admin/types";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import type { StayDraft } from "./useBookingStayDraft";

export function useBookingStaySave(
  bookingId: string,
  onSaved: (booking: BookingRecord, quote: QuoteRecord | null) => void,
) {
  const { tenantId } = useTenant();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (draft: StayDraft): Promise<boolean> => {
      if (!tenantId) return false;
      setSaving(true);
      try {
        const updated = await commitBookingStayChange(tenantId, bookingId, draft);
        const quote = await fetchQuote(tenantId, updated.quoteId).catch(() => null);
        onSaved(updated, quote);
        toastSuccess("Stay updated");
        return true;
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to save stay");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [tenantId, bookingId, onSaved],
  );

  return { save, saving };
}
