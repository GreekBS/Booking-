"use client";

import { X } from "lucide-react";
import type { BookingRecord } from "@/lib/admin/types";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatOperatorDateOnly } from "@/lib/admin/money-presentation";
import { nightsBetween } from "@/lib/admin/utils";
import { formatBookingDisplayId } from "./lib/booking-display";
import { BookingQuickActions } from "./BookingQuickActions";
import { elCommon } from "@/lib/i18n";
import { RESERVATION_IMPORT_SUPERSEDED_BADGE } from "@/features/reservation-import/reservation-import-copy";

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
    <header className="shrink-0 border-b border-border bg-surface px-4 py-3 font-sans sm:px-5 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[22px] font-semibold tracking-tight text-foreground sm:text-2xl">
              {booking.guest.name}
            </h2>
            <StatusBadge status={booking.status} />
            {booking.isSuperseded ? (
              <Badge
                variant="outline"
                className="rounded-md px-2 py-0.5 text-[13px] font-medium"
                data-testid="booking-superseded-badge"
              >
                {RESERVATION_IMPORT_SUPERSEDED_BADGE}
              </Badge>
            ) : null}
          </div>

          <p className="mt-1.5 text-sm text-foreground/70">
            <span>{propertyLabel ?? elCommon.property}</span>
            {" · "}
            <span>{unitLabel ?? elCommon.unit}</span>
          </p>
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onClose}
            aria-label="Κλείσιμο κράτησης"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <MetaChip label={elCommon.checkIn} value={formatOperatorDateOnly(booking.checkIn)} />
        <MetaChip label={elCommon.checkOut} value={formatOperatorDateOnly(booking.checkOut)} />
        <MetaChip label={elCommon.nights} value={String(nights)} />
        <MetaChip label={elCommon.guests} value={String(booking.guestCount)} />
        {reservationTotalLabel ? (
          <MetaChip label="Σύνολο κράτησης" value={reservationTotalLabel} />
        ) : null}
      </div>

      {outstandingLabel ? (
        <p className="mt-2 text-xs text-foreground/70">
          Υπόλοιπο λογαριασμού:{" "}
          <span className="font-semibold tabular-nums text-foreground">{outstandingLabel}</span>
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

      <details className="mt-3 rounded-md border border-border/80 bg-surface-subtle/40 px-3 py-2">
        <summary className="cursor-pointer select-none text-xs font-medium text-foreground/70">
          Τεχνικά στοιχεία
        </summary>
        <p className="mt-2 font-mono text-xs text-muted-foreground" title={booking.id}>
          {formatBookingDisplayId(booking.id)}
          <span className="mt-1 block break-all text-[11px] opacity-80">{booking.id}</span>
        </p>
      </details>
    </header>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-surface-subtle/60 px-2.5 py-2">
      <p className="text-xs font-medium text-foreground/70">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}
