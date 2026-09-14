"use client";

import { useCallback, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceSectionDivider } from "@/features/workspace/components/WorkspaceSection";
import { WorkspaceFooter } from "@/features/workspace/components/WorkspaceFooter";
import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import type { WorkspaceSessionStatus } from "@/features/workspace/lib/workspace-types";
import { useWorkspaceEditorSession } from "@/features/workspace/hooks/useWorkspaceEditorSession";
import type { BookingRecord } from "@/lib/admin/types";
import { BookingWorkspaceHeader } from "./BookingWorkspaceHeader";
import { useBookingActions } from "./hooks/useBookingActions";
import { useBookingWorkspaceData } from "./hooks/useBookingWorkspaceData";
import { useBookingStayDraft } from "./hooks/useBookingStayDraft";
import { useBookingStayPreview } from "./hooks/useBookingStayPreview";
import { useBookingStaySave } from "./hooks/useBookingStaySave";
import { BookingGuestSection } from "./sections/BookingGuestSection";
import { BookingNotesSection } from "./sections/BookingNotesSection";
import { BookingPaymentsSection } from "./sections/BookingPaymentsSection";
import { BookingPricingSection } from "./sections/BookingPricingSection";
import { BookingStaySection } from "./sections/BookingStaySection";
import { BookingTimelineSection } from "./sections/BookingTimelineSection";
import type { BookingWorkspaceLabels, WorkspaceUnitOption } from "./types";

export interface BookingWorkspaceViewProps {
  bookingId: string;
  active: boolean;
  labels?: BookingWorkspaceLabels;
  unitOptions?: WorkspaceUnitOption[];
  onClose: () => void;
  onUpdated?: (booking: BookingRecord) => void;
  fillHeight?: boolean;
  /** When true, renders workspace footer inside the view (bookings drawer). */
  showWorkspaceFooter?: boolean;
}

const TERMINAL_STATUSES = new Set(["cancelled", "completed"]);

function resolveSessionStatus(
  isDirty: boolean,
  saving: boolean,
  saveError: boolean,
): WorkspaceSessionStatus {
  if (saving) return "saving";
  if (saveError) return "error";
  if (isDirty) return "dirty";
  return "clean";
}

export function BookingWorkspaceView({
  bookingId,
  active,
  labels = {},
  unitOptions = [],
  onClose,
  onUpdated,
  fillHeight = true,
  showWorkspaceFooter = false,
}: BookingWorkspaceViewProps) {
  const { requestClose, confirmSave, discardEdits } = useWorkspace();
  const [saveError, setSaveError] = useState(false);

  const { booking, quote, discountTotal, loading, error, setBooking, setQuote, refresh } =
    useBookingWorkspaceData({
      bookingId,
      active,
    });

  const handleUpdated = useCallback(
    (updated: BookingRecord) => {
      setBooking(updated);
      onUpdated?.(updated);
    },
    [onUpdated, setBooking],
  );

  const {
    actionLoading,
    confirmOpen,
    cancelOpen,
    setConfirmOpen,
    setCancelOpen,
    confirmBooking,
    cancelBooking,
  } = useBookingActions(handleUpdated);

  const stayReadOnly = !booking || TERMINAL_STATUSES.has(booking.status);

  const { draft, isDirty, updateDraft, resetDraft } = useBookingStayDraft(booking);
  const { preview, loading: previewLoading, error: previewError } = useBookingStayPreview(
    bookingId,
    draft,
    isDirty && !stayReadOnly,
  );

  const handleSaved = useCallback(
    (updated: BookingRecord, newQuote: typeof quote) => {
      setSaveError(false);
      setBooking(updated);
      if (newQuote) setQuote(newQuote);
      resetDraft();
      onUpdated?.(updated);
    },
    [onUpdated, resetDraft, setBooking, setQuote],
  );

  const { save, saving } = useBookingStaySave(bookingId, handleSaved);

  const canSave =
    isDirty &&
    !stayReadOnly &&
    !previewLoading &&
    !!preview?.available &&
    !preview?.unchanged;

  const sessionStatus = resolveSessionStatus(isDirty, saving, saveError);

  const handleSave = useCallback(async () => {
    if (!draft || !canSave) {
      throw new Error("Cannot save stay changes");
    }

    setSaveError(false);
    const ok = await save(draft);
    if (!ok) {
      setSaveError(true);
      throw new Error("Failed to save stay changes");
    }
  }, [canSave, draft, save]);

  const handleDiscard = useCallback(() => {
    setSaveError(false);
    resetDraft();
  }, [resetDraft]);

  const handleRequestClose = useCallback(() => {
    requestClose(onClose);
  }, [onClose, requestClose]);

  useWorkspaceEditorSession(sessionStatus, {
    onSave: stayReadOnly ? undefined : handleSave,
    onDiscard: handleDiscard,
    canSave: canSave && !stayReadOnly,
  });

  const propertyUnits = useMemo(() => {
    if (!booking) return unitOptions;
    return unitOptions.filter((u) => u.propertyId === booking.propertyId);
  }, [booking, unitOptions]);

  if (!active) return null;

  if (loading && !booking) {
    return (
      <div className={fillHeight ? "flex min-h-0 flex-1 flex-col" : "space-y-4 p-4"}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!booking || !draft) {
    return (
      <div className={fillHeight ? "flex flex-1 items-center justify-center p-4" : "p-4"}>
        <p className="text-sm text-muted-foreground">{error ?? "Booking unavailable."}</p>
      </div>
    );
  }

  const currentBooking = booking;

  const sectionProps = {
    booking: currentBooking,
    quote,
    labels,
    readOnly: true,
  };

  const pricingProps = {
    ...sectionProps,
    discountTotal,
    proposedPreview: preview?.proposed,
  };

  async function handleConfirm() {
    const updated = await confirmBooking(currentBooking);
    if (updated) setBooking(updated);
  }

  async function handleCancel() {
    const updated = await cancelBooking(currentBooking);
    if (updated) {
      setBooking(updated);
      resetDraft();
      void refresh();
    }
  }

  return (
    <div className={fillHeight ? "flex min-h-0 flex-1 flex-col" : "flex flex-col"}>
      <BookingWorkspaceHeader
        booking={currentBooking}
        propertyLabel={labels.propertyLabel}
        unitLabel={labels.unitLabel}
        actionLoading={actionLoading}
        onConfirm={() => setConfirmOpen(true)}
        onCancel={() => setCancelOpen(true)}
        onClose={handleRequestClose}
      />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
        <BookingStaySection
          draft={draft}
          readOnly={stayReadOnly}
          unitOptions={propertyUnits}
          unitLabel={labels.unitLabel}
          preview={preview}
          previewLoading={previewLoading}
          previewError={previewError}
          onDraftChange={updateDraft}
        />
        <WorkspaceSectionDivider />
        <BookingGuestSection {...sectionProps} />
        <WorkspaceSectionDivider />
        <BookingPricingSection {...pricingProps} />
        <WorkspaceSectionDivider />
        <BookingPaymentsSection {...sectionProps} />
        <WorkspaceSectionDivider />
        <BookingNotesSection />
        <WorkspaceSectionDivider />
        <BookingTimelineSection {...sectionProps} />
      </div>

      {showWorkspaceFooter && !stayReadOnly && (
        <WorkspaceFooter
          sessionStatus={sessionStatus}
          onSave={() => void confirmSave()}
          onCancel={discardEdits}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm booking"
        description="Mark this reservation as confirmed?"
        confirmLabel="Confirm"
        loading={actionLoading}
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel booking"
        description="This will cancel the reservation. This action uses the existing cancel API."
        confirmLabel="Cancel booking"
        destructive
        loading={actionLoading}
        onConfirm={handleCancel}
      />
    </div>
  );
}
