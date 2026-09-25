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
  /** Compact summary for reservation pricing (quote total) when available. */
  reservationTotalLabel?: string | null;
  outstandingLabel?: string | null;
}

export function BookingWorkspaceHeader({
  booking,
  propertyLabel,
  unitLabel,
  actionLoading,
  onConfirm,
  onCancel,
  onClose,
  reservationTotalLabel,
  outstandingLabel,
}: BookingWorkspaceHeaderProps) {
  const nights = nightsBetween(booking.checkIn, booking.checkOut);

  return (
    <header className="shrink-0 border-b border-border bg-surface px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {booking.guest.name}
            </h2>
            <StatusBadge status={booking.status} />
          </div>

          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {formatBookingDisplayId(booking.id)}
          </p>

          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className="text-foreground/80">
              {propertyLabel ?? "Property"}
            </span>
            {" · "}
            <span className="text-foreground/80">{unitLabel ?? "Unit"}</span>
          </p>
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
            aria-label="Close reservation"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <MetaChip label="Arrival" value={booking.checkIn} />
        <MetaChip label="Departure" value={booking.checkOut} />
        <MetaChip label="Nights" value={String(nights)} />
        <MetaChip label="Guests" value={String(booking.guestCount)} />
        {reservationTotalLabel ? (
          <MetaChip label="Reservation total" value={reservationTotalLabel} />
        ) : null}
      </div>

      {outstandingLabel ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Folio outstanding:{" "}
          <span className="font-semibold text-foreground">{outstandingLabel}</span>
        </p>
      ) : null}

      <div className="mt-3">
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

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-surface-subtle/50 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}
