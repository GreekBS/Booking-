"use client";

import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import type { BookingSectionProps } from "../types";

export function BookingGuestSection({ booking }: BookingSectionProps) {
  return (
    <WorkspaceSection title="Guest contact">
      <WorkspaceDetailList>
        <WorkspaceDetailRow label="Full name" value={booking.guest.name} />
        <WorkspaceDetailRow label="Email" value={booking.guest.email} />
        <WorkspaceDetailRow label="Phone" value={booking.guest.phone ?? "—"} />
      </WorkspaceDetailList>
    </WorkspaceSection>
  );
}
