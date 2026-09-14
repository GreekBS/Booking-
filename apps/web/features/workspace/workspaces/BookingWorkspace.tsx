"use client";

import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { useCalendarActions } from "@/features/extranet-calendar/context/CalendarActionsContext";
import type { RackUnit, WorkspaceBookingTarget } from "@/features/extranet-calendar/types";
import { BookingWorkspaceView } from "@/features/bookings/workspace/BookingWorkspaceView";

interface BookingWorkspaceProps {
  target: WorkspaceBookingTarget;
  active: boolean;
  units: RackUnit[];
}

export function BookingWorkspace({ target, active, units }: BookingWorkspaceProps) {
  const { closeWorkspace } = useWorkspace();
  const { refreshCalendars } = useCalendarActions();

  const unitOptions = units.map((u) => ({
    unitId: u.unitId,
    unitName: u.unitName,
    propertyId: u.propertyId,
  }));

  return (
    <BookingWorkspaceView
      bookingId={target.id}
      active={active}
      labels={{
        propertyLabel: target.propertyName,
        unitLabel: target.unitName,
      }}
      unitOptions={unitOptions}
      onClose={closeWorkspace}
      onUpdated={() => refreshCalendars()}
      fillHeight
    />
  );
}
