"use client";

import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { useCalendarActions } from "@/features/extranet-calendar/context/CalendarActionsContext";
import type { RackUnit, WorkspaceBookingTarget } from "@/features/extranet-calendar/types";
import { BookingWorkspaceView } from "@/features/bookings/workspace/BookingWorkspaceView";
import { displayUnitName } from "@/lib/i18n";

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
    unitName: displayUnitName(u.unitName),
    propertyId: u.propertyId,
  }));

  return (
    <BookingWorkspaceView
      bookingId={target.id}
      active={active}
      labels={{
        propertyLabel: target.propertyName,
        unitLabel: displayUnitName(target.unitName),
      }}
      unitOptions={unitOptions}
      onClose={closeWorkspace}
      onUpdated={() => refreshCalendars()}
      fillHeight
    />
  );
}
