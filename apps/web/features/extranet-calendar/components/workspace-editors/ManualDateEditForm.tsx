"use client";

import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import type { OperatorBlockType } from "@/lib/admin/types";
import { normalizeDecimalMoney } from "@/lib/admin/utils";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCalendarActions } from "../../context/CalendarActionsContext";
import {
  createBlockForDateRange,
  openDatesForDateRange,
  updateUnitMinStay,
  validateExclusiveDateRange,
} from "../../lib/selection-availability-actions";
import { setNightlyPriceForDateRange } from "../../lib/rate-plan-actions";
import { addDaysIso } from "../../lib/timeline-model";
import { useTimelineInteraction } from "../../context/TimelineInteractionContext";
import { SetNightlyPriceFields } from "./SetNightlyPriceFields";
import type { RackUnit } from "../../types";

export type ManualAvailabilityAction =
  | "manual_block"
  | "maintenance"
  | "cleaning"
  | "owner_stay"
  | "open_dates"
  | "min_stay";

const ACTION_OPTIONS: Array<{ value: ManualAvailabilityAction; label: string }> = [
  { value: "manual_block", label: "Manual block" },
  { value: "maintenance", label: "Maintenance" },
  { value: "cleaning", label: "Cleaning" },
  { value: "owner_stay", label: "Owner stay" },
  { value: "open_dates", label: "Open dates" },
  { value: "min_stay", label: "Set minimum stay" },
];

const BLOCK_ACTIONS = new Set<ManualAvailabilityAction>([
  "manual_block",
  "maintenance",
  "cleaning",
  "owner_stay",
]);

function blockTypeForAction(action: ManualAvailabilityAction): OperatorBlockType {
  switch (action) {
    case "maintenance":
      return "maintenance";
    case "cleaning":
      return "cleaning";
    case "owner_stay":
      return "owner";
    default:
      return "manual";
  }
}

function actionSuccessLabel(action: ManualAvailabilityAction): string {
  if (action === "open_dates") return "Dates opened";
  if (action === "min_stay") return "Minimum stay updated";
  if (action === "manual_block") return "Dates blocked";
  return `${blockTypeForAction(action).replace("_", " ")} block created`;
}

function defaultUnitId(units: RackUnit[], selectedUnitId: string | null): string {
  if (units.length === 1) return units[0]!.unitId;
  if (selectedUnitId && units.some((u) => u.unitId === selectedUnitId)) return selectedUnitId;
  return units[0]?.unitId ?? "";
}

interface ManualDateEditFormProps {
  units: RackUnit[];
  selectedUnitId: string | null;
}

export function ManualDateEditForm({ units, selectedUnitId }: ManualDateEditFormProps) {
  const { tenantId } = useTenant();
  const { selection } = useTimelineInteraction();
  const {
    refreshCalendars,
    calendarsByUnit,
    rulesByUnit,
    ratePlansByUnit,
    patchRulesForUnit,
    patchRatePlanForUnit,
  } = useCalendarActions();

  const initialUnitId = useMemo(
    () => defaultUnitId(units, selectedUnitId),
    [units, selectedUnitId],
  );

  const [unitId, setUnitId] = useState(initialUnitId);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [nightlyPrice, setNightlyPrice] = useState("");
  const [action, setAction] = useState<ManualAvailabilityAction | null>(null);
  const [reason, setReason] = useState("");
  const [minStay, setMinStay] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selection) return;
    setUnitId(defaultUnitId(units, selectedUnitId));
  }, [units, selectedUnitId, selection]);

  useEffect(() => {
    if (!selection) return;
    const from = selection.from <= selection.to ? selection.from : selection.to;
    const to = selection.from <= selection.to ? selection.to : selection.from;
    setUnitId(selection.unitId);
    setCheckIn(from);
    setCheckOut(addDaysIso(to, 1));
    if (selection.openMinStay) {
      setAction("min_stay");
    }
  }, [selection]);

  useEffect(() => {
    if (action === "min_stay" && unitId) {
      setMinStay(rulesByUnit[unitId]?.minNights ?? 1);
    }
  }, [action, unitId, rulesByUnit]);

  const showReason = action !== null && BLOCK_ACTIONS.has(action);
  const showMinStay = action === "min_stay";
  const currency = unitId ? (ratePlansByUnit[unitId]?.currency ?? "EUR") : "EUR";

  function resetForm() {
    setCheckIn("");
    setCheckOut("");
    setReason("");
    setNightlyPrice("");
    setAction(null);
  }

  async function handleApply() {
    if (!tenantId) return;

    if (!unitId) {
      toastError("Unit is required");
      return;
    }

    const rangeError = validateExclusiveDateRange({ checkIn, checkOut });
    if (rangeError) {
      toastError(rangeError);
      return;
    }

    const hasPrice = nightlyPrice.trim().length > 0;
    const hasAction = action !== null;

    if (!hasPrice && !hasAction) {
      toastError("Enter a nightly price and/or choose an action");
      return;
    }

    if (hasPrice) {
      const normalized = normalizeDecimalMoney(nightlyPrice.trim());
      if (!normalized || Number.parseFloat(normalized) <= 0) {
        toastError("Enter a valid positive amount (e.g. 120 or 120.50).");
        return;
      }
    }

    if (hasAction && action === "min_stay") {
      if (!Number.isInteger(minStay) || minStay < 1) {
        toastError("Minimum stay must be a positive integer");
        return;
      }
    }

    setBusy(true);
    const outcomes: string[] = [];

    try {
      if (hasPrice) {
        const saved = await setNightlyPriceForDateRange({
          tenantId,
          unitId,
          checkIn,
          checkOut,
          nightlyPrice: nightlyPrice.trim(),
          existingPlan: ratePlansByUnit[unitId],
        });
        patchRatePlanForUnit(unitId, saved);
        outcomes.push("Nightly price updated");
      }

      if (hasAction && action) {
        if (action === "open_dates") {
          const released = await openDatesForDateRange({
            tenantId,
            unitId,
            checkIn,
            checkOut,
            calendar: calendarsByUnit[unitId],
          });
          outcomes.push(released ? "Dates opened" : "No blocks to release");
          refreshCalendars();
        } else if (action === "min_stay") {
          const updated = await updateUnitMinStay({
            tenantId,
            unitId,
            minNights: minStay,
            rules: rulesByUnit[unitId],
          });
          patchRulesForUnit(unitId, updated);
          outcomes.push("Minimum stay updated");
          refreshCalendars();
        } else {
          await createBlockForDateRange({
            tenantId,
            unitId,
            checkIn,
            checkOut,
            blockType: blockTypeForAction(action),
            reason: showReason ? reason || null : null,
          });
          outcomes.push(actionSuccessLabel(action));
          refreshCalendars();
        }
      }

      toastSuccess(outcomes.join(" and "));
      resetForm();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (units.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Select a property with units to edit availability.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-[#111827] dark:text-foreground">Edit availability</p>
        <p className="mt-1 text-xs text-[#6b7280] dark:text-muted-foreground">
          Or click a day / drag a range on the calendar.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="manual-edit-unit">Unit</Label>
        <Select value={unitId || undefined} onValueChange={setUnitId}>
          <SelectTrigger id="manual-edit-unit">
            <SelectValue placeholder="Select unit" />
          </SelectTrigger>
          <SelectContent>
            {units.map((unit) => (
              <SelectItem key={unit.unitId} value={unit.unitId}>
                {unit.unitName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="manual-edit-check-in">Check-in</Label>
          <Input
            id="manual-edit-check-in"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manual-edit-check-out">Check-out</Label>
          <Input
            id="manual-edit-check-out"
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Check-out is exclusive (last night is the day before).</p>

      <SetNightlyPriceFields
        idPrefix="manual-edit"
        price={nightlyPrice}
        onPriceChange={setNightlyPrice}
        currency={currency}
      />

      <div className="space-y-2">
        <Label htmlFor="manual-edit-action">Action</Label>
        <Select
          value={action ?? undefined}
          onValueChange={(v) => setAction(v as ManualAvailabilityAction)}
        >
          <SelectTrigger id="manual-edit-action">
            <SelectValue placeholder="Optional" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showReason && (
        <div className="space-y-2">
          <Label htmlFor="manual-edit-reason">Reason (optional)</Label>
          <Input
            id="manual-edit-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      {showMinStay && (
        <div className="space-y-2">
          <Label htmlFor="manual-edit-min-stay">Minimum stay (nights)</Label>
          <Input
            id="manual-edit-min-stay"
            type="number"
            min={1}
            step={1}
            value={minStay}
            onChange={(e) => setMinStay(Number(e.target.value))}
          />
          <p className="text-[11px] text-muted-foreground">
            Updates availability rules for the selected unit. Per-date min stay is not yet supported.
          </p>
        </div>
      )}

      <Button type="button" disabled={busy} onClick={() => void handleApply()}>
        Apply
      </Button>
    </div>
  );
}
