"use client";

import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import type { BookingSectionProps } from "../types";

/**
 * CRM-2: reservation contact snapshot + minimal linked Guest identity.
 * Full Guest Profile/Directory is CRM-3 — no dead profile links.
 */
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
          <WorkspaceDetailList>
            <WorkspaceDetailRow label="Display name" value={linked.displayName} />
            <WorkspaceDetailRow label="Email" value={linked.email ?? "—"} />
            <WorkspaceDetailRow label="Phone" value={linked.phone ?? "—"} />
            <WorkspaceDetailRow label="Guest id" value={linked.id} />
          </WorkspaceDetailList>
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
