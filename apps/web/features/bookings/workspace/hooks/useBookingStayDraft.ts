"use client";

import { useCallback, useMemo, useState } from "react";
import type { BookingRecord } from "@/lib/admin/types";

export interface StayDraft {
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export function bookingToStayDraft(booking: BookingRecord): StayDraft {
  return {
    unitId: booking.unitId,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guestCount: booking.guestCount,
  };
}

export function isStayDraftDirty(booking: BookingRecord, draft: StayDraft): boolean {
  return (
    booking.unitId !== draft.unitId ||
    booking.checkIn !== draft.checkIn ||
    booking.checkOut !== draft.checkOut ||
    booking.guestCount !== draft.guestCount
  );
}

export function useBookingStayDraft(booking: BookingRecord | null) {
  const [draft, setDraft] = useState<StayDraft | null>(null);

  const effectiveDraft = useMemo(() => {
    if (!booking) return null;
    return draft ?? bookingToStayDraft(booking);
  }, [booking, draft]);

  const resetDraft = useCallback(() => {
    setDraft(null);
  }, []);

  const updateDraft = useCallback((patch: Partial<StayDraft>) => {
    setDraft((prev) => {
      if (!booking) return prev;
      const base = prev ?? bookingToStayDraft(booking);
      return { ...base, ...patch };
    });
  }, [booking]);

  const isDirty = booking && effectiveDraft
    ? isStayDraftDirty(booking, effectiveDraft)
    : false;

  return {
    draft: effectiveDraft,
    isDirty,
    updateDraft,
    resetDraft,
  };
}
