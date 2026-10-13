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
    <header className="shrink-0 border-b border-border bg-surface px-4 py-3.5 font-sans sm:px-5 sm:py-4">
      {/* Row 1 — identity + close */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[23px] font-bold leading-7 tracking-tight text-foreground">
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

          <p className="mt-1 text-[13px] font-medium leading-[19px] text-[hsl(var(--foreground-muted))]">
            <span>{propertyLabel ?? elCommon.property}</span>
            {unitLabel ? <span>{` · ${unitLabel}`}</span> : null}
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

      {/* Row 2 — booking summary strip */}
      <div
        className={
          reservationTotalLabel
            ? "mt-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-[11px] border border-border bg-border sm:grid-cols-3 lg:grid-cols-5"
            : "mt-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-[11px] border border-border bg-border sm:grid-cols-4"
        }
      >
        <SummaryCell
          label={elCommon.checkIn}
          value={formatOperatorDateOnly(booking.checkIn)}
        />
        <SummaryCell
          label={elCommon.checkOut}
          value={formatOperatorDateOnly(booking.checkOut)}
        />
        <SummaryCell label={elCommon.nights} value={String(nights)} />
        <SummaryCell label={elCommon.guests} value={String(booking.guestCount)} />
        {reservationTotalLabel ? (
          <SummaryCell
            label="Σύνολο κράτησης"
            value={reservationTotalLabel}
            emphasize
            className="col-span-2 sm:col-span-1"
          />
        ) : null}
      </div>

      {outstandingLabel ? (
        <p className="mt-2.5 text-[12px] leading-[18px] text-[hsl(var(--foreground-muted))]">
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

      <details className="mt-3 rounded-md border border-border bg-surface-subtle px-3 py-2">
        <summary className="cursor-pointer select-none text-[12px] font-medium leading-[18px] text-muted-foreground">
          Τεχνικά στοιχεία
        </summary>
        <p className="mt-2 font-mono text-[12px] leading-[18px] text-muted-foreground" title={booking.id}>
          {formatBookingDisplayId(booking.id)}
          <span className="mt-1 block break-all text-[12px] opacity-80">{booking.id}</span>
        </p>
      </details>
    </header>
  );
}

function SummaryCell({
  label,
  value,
  emphasize = false,
  className,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface-subtle px-3 py-2.5 sm:px-3.5 ${className ?? ""}`.trim()}
    >
      <p className="text-[12px] font-medium leading-[18px] text-muted-foreground">{label}</p>
      <p
        className={
          emphasize
            ? "mt-0.5 truncate text-[20px] font-bold leading-7 tabular-nums tracking-tight text-foreground"
            : "mt-0.5 truncate text-[14px] font-medium leading-[21px] tabular-nums text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}
