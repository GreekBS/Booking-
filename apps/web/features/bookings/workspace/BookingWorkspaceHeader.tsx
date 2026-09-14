"use client";

import { X } from "lucide-react";
import type { BookingRecord } from "@/lib/admin/types";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { nightsBetween } from "@/lib/admin/utils";
import { formatBookingDisplayId } from "./lib/booking-display";
import { BookingQuickActions } from "./BookingQuickActions";

interface BookingWorkspaceHeaderProps {
  booking: BookingRecord;
  propertyLabel?: string;
  unitLabel?: string;
  actionLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onClose?: () => void;
}

export function BookingWorkspaceHeader({
  booking,
  propertyLabel,
  unitLabel,
  actionLoading,
  onConfirm,
  onCancel,
  onClose,
}: BookingWorkspaceHeaderProps) {
  const nights = nightsBetween(booking.checkIn, booking.checkOut);

  return (
    <header className="shrink-0 border-b border-[#d1d5db] bg-white px-4 py-4 dark:border-border dark:bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {formatBookingDisplayId(booking.id)}
            </span>
            <StatusBadge status={booking.status} />
          </div>

          <h2 className="mt-2 text-lg font-semibold leading-tight">{booking.guest.name}</h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {propertyLabel ?? booking.propertyId.slice(0, 8)}
            {" · "}
            {unitLabel ?? booking.unitId.slice(0, 8)}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">Arrival </span>
          <span className="font-medium">{booking.checkIn}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Departure </span>
          <span className="font-medium">{booking.checkOut}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Nights </span>
          <span className="font-medium">{nights}</span>
        </span>
      </div>

      <div className="mt-4">
        <BookingQuickActions
          booking={booking}
          actionLoading={actionLoading}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </div>
    </header>
  );
}
