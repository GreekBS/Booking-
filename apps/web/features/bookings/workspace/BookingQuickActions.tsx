"use client";

import type { BookingRecord } from "@/lib/admin/types";
import { Button } from "@/components/ui/button";
import { elCommon } from "@/lib/i18n";

interface BookingQuickActionsProps {
  booking: BookingRecord;
  actionLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BookingQuickActions({
  booking,
  actionLoading,
  onConfirm,
  onCancel,
}: BookingQuickActionsProps) {
  const canConfirm = booking.status === "pending" || booking.status === "payment_pending";
  const canCancel = booking.status !== "cancelled" && booking.status !== "completed";

  if (!canConfirm && !canCancel) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canConfirm ? (
        <Button size="sm" disabled={actionLoading} onClick={onConfirm}>
          {elCommon.confirm}
        </Button>
      ) : null}
      {canCancel ? (
        <Button size="sm" variant="destructive" disabled={actionLoading} onClick={onCancel}>
          Ακύρωση κράτησης
        </Button>
      ) : null}
    </div>
  );
}
