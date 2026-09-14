import type { BookingRecord, QuoteRecord } from "@/lib/admin/types";
import type { StayChangePreviewRecord } from "@/lib/admin/types";

export interface BookingWorkspaceLabels {
  propertyLabel?: string;
  unitLabel?: string;
}

export interface WorkspaceUnitOption {
  unitId: string;
  unitName: string;
  propertyId: string;
}

export interface BookingSectionProps {
  booking: BookingRecord;
  quote: QuoteRecord | null;
  labels: BookingWorkspaceLabels;
  readOnly: boolean;
}

export interface BookingStaySectionEditorProps {
  draft: import("./hooks/useBookingStayDraft").StayDraft;
  readOnly: boolean;
  unitOptions: WorkspaceUnitOption[];
  labels: BookingWorkspaceLabels;
  preview: StayChangePreviewRecord | null;
  previewLoading: boolean;
  previewError: string | null;
  onDraftChange: (patch: Partial<import("./hooks/useBookingStayDraft").StayDraft>) => void;
}

export interface BookingPricingSectionProps extends BookingSectionProps {
  discountTotal: number | null;
  proposedPreview?: {
    totalAmount: string;
    currency: string;
  } | null;
}
