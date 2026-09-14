"use client";

import type { BookingRecord } from "@/lib/admin/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BookingWorkspaceView } from "./workspace/BookingWorkspaceView";

interface BookingDetailDrawerProps {
  booking: BookingRecord | null;
  unitLabel?: string;
  propertyLabel?: string;
  unitOptions?: import("./workspace/types").WorkspaceUnitOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (booking: BookingRecord) => void;
  requestClose: (proceed: () => void) => boolean;
}

export function BookingDetailDrawer({
  booking,
  unitLabel,
  propertyLabel,
  unitOptions = [],
  open,
  onOpenChange,
  onUpdated,
  requestClose,
}: BookingDetailDrawerProps) {
  if (!booking) return null;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    requestClose(() => onOpenChange(false));
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="sr-only">
          <SheetTitle>Booking details</SheetTitle>
          <SheetDescription>Reservation information and actions</SheetDescription>
        </SheetHeader>

        {open && (
          <BookingWorkspaceView
            bookingId={booking.id}
            active={open}
            labels={{ propertyLabel, unitLabel }}
            unitOptions={unitOptions}
            onClose={() => requestClose(() => onOpenChange(false))}
            onUpdated={onUpdated}
            fillHeight
            showWorkspaceFooter
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
