"use client";

import { Mail, Printer } from "lucide-react";
import type { BookingRecord } from "@/lib/admin/types";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="flex flex-wrap gap-2">
      {booking.status === "pending" && (
        <Button size="sm" disabled={actionLoading} onClick={onConfirm}>
          Confirm
        </Button>
      )}
      {booking.status !== "cancelled" && booking.status !== "completed" && (
        <Button size="sm" variant="destructive" disabled={actionLoading} onClick={onCancel}>
          Cancel
        </Button>
      )}
      <Button size="sm" variant="outline" disabled title="Coming in a future release">
        <Mail className="mr-1.5 h-3.5 w-3.5" />
        Message
      </Button>
      <Button size="sm" variant="outline" disabled title="Coming in a future release">
        <Printer className="mr-1.5 h-3.5 w-3.5" />
        Print
      </Button>
    </div>
  );
}
