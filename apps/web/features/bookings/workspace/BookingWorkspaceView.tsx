"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceFooter } from "@/features/workspace/components/WorkspaceFooter";
import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import type { WorkspaceSessionStatus } from "@/features/workspace/lib/workspace-types";
import { useWorkspaceEditorSession } from "@/features/workspace/hooks/useWorkspaceEditorSession";
import type { BookingRecord } from "@/lib/admin/types";
import { formatMoney } from "@/lib/admin/utils";
import { BookingWorkspaceHeader } from "./BookingWorkspaceHeader";
import { useBookingActions } from "./hooks/useBookingActions";
import { useBookingWorkspaceData } from "./hooks/useBookingWorkspaceData";
import { useBookingStayDraft } from "./hooks/useBookingStayDraft";
import { useBookingStayPreview } from "./hooks/useBookingStayPreview";
import { useBookingStaySave } from "./hooks/useBookingStaySave";
import { BookingGuestSection } from "./sections/BookingGuestSection";
import { BookingBillingFiscalSection } from "./sections/BookingBillingFiscalSection";
import { BookingNotesSection } from "./sections/BookingNotesSection";
import { BookingOperationsTasksSection } from "./sections/BookingOperationsTasksSection";
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
  const [tab, setTab] = useState("overview");
  const [outstandingLabel, setOutstandingLabel] = useState<string | null>(null);

  useEffect(() => {
    setTab("overview");
    setOutstandingLabel(null);
  }, [bookingId]);

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

  const reservationTotalLabel = quote
    ? formatMoney(quote.totalAmount, quote.currency)
    : null;

  if (!active) return null;

  if (loading && !booking) {
    return (
      <div className={fillHeight ? "flex min-h-0 flex-1 flex-col gap-3 p-4" : "space-y-3 p-4"}>
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
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
        reservationTotalLabel={reservationTotalLabel}
        outstandingLabel={outstandingLabel}
      />

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border bg-surface px-3 pt-2 sm:px-4">
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="rounded-md px-3 py-1.5 text-xs data-[state=active]:bg-primary-subtle data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="financials"
              className="rounded-md px-3 py-1.5 text-xs data-[state=active]:bg-primary-subtle data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              Financials
            </TabsTrigger>
            <TabsTrigger
              value="guest"
              className="rounded-md px-3 py-1.5 text-xs data-[state=active]:bg-primary-subtle data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              Guest &amp; Billing
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="rounded-md px-3 py-1.5 text-xs data-[state=active]:bg-primary-subtle data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              Activity
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm sm:px-5">
          <TabsContent value="overview" className="mt-0 space-y-5 focus-visible:outline-none">
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
            <BookingOperationsTasksSection
              bookingId={currentBooking.id}
              propertyId={currentBooking.propertyId}
              unitId={currentBooking.unitId}
              active={active}
            />
            <BookingGuestSection {...sectionProps} />
            <BookingPricingSection {...pricingProps} />
          </TabsContent>

          <TabsContent
            value="financials"
            forceMount
            className={
              tab === "financials"
                ? "mt-0 space-y-5 focus-visible:outline-none"
                : "mt-0 hidden"
            }
          >
            <BookingPricingSection {...pricingProps} />
            <BookingPaymentsSection
              {...sectionProps}
              active
              onOutstandingChange={setOutstandingLabel}
            />
          </TabsContent>

          <TabsContent value="guest" className="mt-0 space-y-5 focus-visible:outline-none">
            <BookingGuestSection {...sectionProps} />
            <BookingBillingFiscalSection {...sectionProps} />
          </TabsContent>

          <TabsContent value="activity" className="mt-0 space-y-5 focus-visible:outline-none">
            <BookingTimelineSection {...sectionProps} />
            <BookingNotesSection />
          </TabsContent>
        </div>
      </Tabs>

      {showWorkspaceFooter && !stayReadOnly ? (
        <WorkspaceFooter
          sessionStatus={sessionStatus}
          onSave={() => void confirmSave()}
          onCancel={discardEdits}
        />
      ) : null}

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
