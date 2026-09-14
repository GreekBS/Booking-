"use client";

import { nightsBetween, formatMoney } from "@/lib/admin/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import type { StayChangePreviewRecord } from "@/lib/admin/types";
import type { StayDraft } from "../hooks/useBookingStayDraft";
import type { WorkspaceUnitOption } from "../types";

export interface BookingStaySectionProps {
  draft: StayDraft;
  readOnly: boolean;
  unitOptions: WorkspaceUnitOption[];
  unitLabel?: string;
  preview: StayChangePreviewRecord | null;
  previewLoading: boolean;
  previewError: string | null;
  onDraftChange: (patch: Partial<StayDraft>) => void;
}

export function BookingStaySection({
  draft,
  readOnly,
  unitOptions,
  unitLabel,
  preview,
  previewLoading,
  previewError,
  onDraftChange,
}: BookingStaySectionProps) {
  const nights = nightsBetween(draft.checkIn, draft.checkOut);

  if (readOnly) {
    return (
      <WorkspaceSection title="Stay">
        <WorkspaceDetailList>
          <WorkspaceDetailRow label="Arrival" value={draft.checkIn} />
          <WorkspaceDetailRow label="Departure" value={draft.checkOut} />
          <WorkspaceDetailRow label="Nights" value={String(nights)} />
          <WorkspaceDetailRow label="Guests" value={String(draft.guestCount)} />
        </WorkspaceDetailList>
      </WorkspaceSection>
    );
  }

  return (
    <WorkspaceSection title="Stay">
      <div className="space-y-3">
        {unitOptions.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="stay-unit">Unit</Label>
            <Select
              value={draft.unitId}
              onValueChange={(unitId) => onDraftChange({ unitId })}
            >
              <SelectTrigger id="stay-unit">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map((unit) => (
                  <SelectItem key={unit.unitId} value={unit.unitId}>
                    {unit.unitName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <WorkspaceDetailRow label="Unit" value={unitLabel ?? draft.unitId.slice(0, 8)} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="stay-check-in">Arrival</Label>
            <Input
              id="stay-check-in"
              type="date"
              value={draft.checkIn}
              onChange={(e) => onDraftChange({ checkIn: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stay-check-out">Departure</Label>
            <Input
              id="stay-check-out"
              type="date"
              value={draft.checkOut}
              onChange={(e) => onDraftChange({ checkOut: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stay-guests">Guests</Label>
          <Input
            id="stay-guests"
            type="number"
            min={1}
            max={50}
            value={draft.guestCount}
            onChange={(e) =>
              onDraftChange({ guestCount: Number.parseInt(e.target.value, 10) || 1 })
            }
          />
        </div>

        <WorkspaceDetailRow label="Nights" value={String(nights)} />

        {previewLoading && (
          <p className="text-xs text-muted-foreground">Checking availability…</p>
        )}
        {previewError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {previewError}
          </p>
        )}
        {preview && !preview.available && preview.reasons.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {preview.reasons.map((r) => (
              <p key={r.code}>{r.message}</p>
            ))}
          </div>
        )}
        {preview?.priceDelta && preview.proposed && (
          <p className="text-xs text-muted-foreground">
            New total: {formatMoney(preview.proposed.totalAmount, preview.proposed.currency)}
            {" · "}
            <span
              className={
                preview.priceDelta.amount.startsWith("-")
                  ? "text-green-700 dark:text-green-400"
                  : "text-amber-800 dark:text-amber-200"
              }
            >
              {preview.priceDelta.amount.startsWith("-") ? "" : "+"}
              {formatMoney(preview.priceDelta.amount, preview.priceDelta.currency)} vs current
            </span>
          </p>
        )}
      </div>
    </WorkspaceSection>
  );
}
