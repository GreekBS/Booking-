"use client";

import Link from "next/link";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import { Button } from "@/components/ui/button";
import type { BookingSectionProps } from "../types";

/** Reservation contact snapshot + linked CRM Guest identity when authorized. */
export function BookingGuestSection({ booking }: BookingSectionProps) {
  const linked = booking.linkedGuest ?? null;

  return (
    <>
      <WorkspaceSection title="Guest contact">
        <WorkspaceDetailList>
          <WorkspaceDetailRow label="Full name" value={booking.guest.name} />
          <WorkspaceDetailRow label="Email" value={booking.guest.email} />
          <WorkspaceDetailRow label="Phone" value={booking.guest.phone ?? "—"} />
        </WorkspaceDetailList>
      </WorkspaceSection>

      <WorkspaceSection title="Linked Guest">
        {linked ? (
          <>
            <WorkspaceDetailList>
              <WorkspaceDetailRow label="Display name" value={linked.displayName} />
              <WorkspaceDetailRow label="Email" value={linked.email ?? "—"} />
              <WorkspaceDetailRow label="Phone" value={linked.phone ?? "—"} />
              <WorkspaceDetailRow label="Guest id" value={linked.id} />
            </WorkspaceDetailList>
            <div className="mt-3">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/guests/${linked.id}`}>View Guest Profile</Link>
              </Button>
            </div>
          </>
        ) : booking.guestId ? (
          <WorkspaceDetailList>
            <WorkspaceDetailRow label="Guest id" value={booking.guestId} />
            <WorkspaceDetailRow
              label="Status"
              value="Linked (identity details unavailable)"
            />
          </WorkspaceDetailList>
        ) : (
          <p className="text-sm text-muted-foreground">
            No CRM Guest linked to this reservation.
          </p>
        )}
      </WorkspaceSection>
    </>
  );
}
