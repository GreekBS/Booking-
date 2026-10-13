"use client";

import Link from "next/link";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import { Button } from "@/components/ui/button";
import type { BookingSectionProps } from "../types";
import { elCommon } from "@/lib/i18n";

interface BookingGuestSectionProps extends BookingSectionProps {
  /** Overview: contact snapshot only; full CRM stays on the Guest tab. */
  compact?: boolean;
}

/** Reservation contact snapshot + linked CRM Guest identity when authorized. */
export function BookingGuestSection({ booking, compact = false }: BookingGuestSectionProps) {
  const linked = booking.linkedGuest ?? null;

  return (
    <>
      <WorkspaceSection title="Επικοινωνία επισκέπτη">
        <WorkspaceDetailList>
          <WorkspaceDetailRow label="Πλήρες όνομα" value={booking.guest.name} />
          <WorkspaceDetailRow label={elCommon.email} value={booking.guest.email} />
          <WorkspaceDetailRow label={elCommon.phone} value={booking.guest.phone ?? "—"} />
        </WorkspaceDetailList>
      </WorkspaceSection>

      {compact ? null : (
        <WorkspaceSection title="Συνδεδεμένος επισκέπτης (CRM)">
          {linked ? (
            <>
              <WorkspaceDetailList>
                <WorkspaceDetailRow label="Εμφανιζόμενο όνομα" value={linked.displayName} />
                <WorkspaceDetailRow label={elCommon.email} value={linked.email ?? "—"} />
                <WorkspaceDetailRow label={elCommon.phone} value={linked.phone ?? "—"} />
                <WorkspaceDetailRow label="ID επισκέπτη" value={linked.id} mono />
              </WorkspaceDetailList>
              <div className="mt-3">
                <Button variant="outline" size="sm" className="h-9" asChild>
                  <Link href={`/dashboard/guests/${linked.id}`}>Προφίλ επισκέπτη</Link>
                </Button>
              </div>
            </>
          ) : booking.guestId ? (
            <WorkspaceDetailList>
              <WorkspaceDetailRow label="ID επισκέπτη" value={booking.guestId} mono />
              <WorkspaceDetailRow
                label={elCommon.status}
                value="Συνδέθηκε (τα στοιχεία ταυτότητας δεν είναι διαθέσιμα)"
              />
            </WorkspaceDetailList>
          ) : (
            <p className="text-[14px] leading-[22px] text-muted-foreground">
              Δεν υπάρχει συνδεδεμένος επισκέπτης CRM σε αυτή την κράτηση.
            </p>
          )}
        </WorkspaceSection>
      )}
    </>
  );
}
