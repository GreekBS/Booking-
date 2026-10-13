"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { displayUnitName, elCommon } from "@/lib/i18n";

export interface BookingAdvancedFilters {
  unitId: string;
  checkInFrom: string;
  checkInTo: string;
  checkOutFrom: string;
  checkOutTo: string;
  /** Talos registration date — not original guest booking date. */
  registeredFrom: string;
  registeredTo: string;
}

export const EMPTY_BOOKING_FILTERS: BookingAdvancedFilters = {
  unitId: "all",
  checkInFrom: "",
  checkInTo: "",
  checkOutFrom: "",
  checkOutTo: "",
  registeredFrom: "",
  registeredTo: "",
};

export function countActiveBookingFilters(filters: BookingAdvancedFilters): number {
  let n = 0;
  if (filters.unitId !== "all") n += 1;
  if (filters.checkInFrom) n += 1;
  if (filters.checkInTo) n += 1;
  if (filters.checkOutFrom) n += 1;
  if (filters.checkOutTo) n += 1;
  if (filters.registeredFrom) n += 1;
  if (filters.registeredTo) n += 1;
  return n;
}

function rangeError(from: string, to: string): string | null {
  if (from && to && from > to) {
    return "Η ημερομηνία «από» πρέπει να είναι πριν από την «έως».";
  }
  return null;
}

interface UnitOption {
  id: string;
  name: string;
}

interface BookingFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: BookingAdvancedFilters;
  units: UnitOption[];
  onApply: (filters: BookingAdvancedFilters) => void;
  onClear: () => void;
}

export function BookingFiltersSheet({
  open,
  onOpenChange,
  applied,
  units,
  onApply,
  onClear,
}: BookingFiltersSheetProps) {
  const [draft, setDraft] = useState<BookingAdvancedFilters>(applied);

  useEffect(() => {
    if (open) setDraft(applied);
  }, [open, applied]);

  const errors = useMemo(() => {
    return [
      rangeError(draft.checkInFrom, draft.checkInTo),
      rangeError(draft.checkOutFrom, draft.checkOutTo),
      rangeError(draft.registeredFrom, draft.registeredTo),
    ].filter(Boolean) as string[];
  }, [draft]);

  const activeCount = countActiveBookingFilters(applied);

  function patch(partial: Partial<BookingAdvancedFilters>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={() => onOpenChange(true)}
        aria-label={
          activeCount > 0 ? `Φίλτρα (${activeCount} ενεργά)` : "Άνοιγμα φίλτρων"
        }
      >
        <Filter className="h-3.5 w-3.5" />
        Φίλτρα
        {activeCount > 0 ? (
          <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Φίλτρα κρατήσεων</SheetTitle>
            <SheetDescription>
              Εφαρμόζονται σε όλες τις σελίδες αποτελεσμάτων. Η «ημ. καταχώρησης»
              είναι η ημερομηνία εγγραφής στο Talos — όχι η αρχική ημερομηνία
              κράτησης σε κανάλι/CSV.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex-1 space-y-4 overflow-y-auto pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="bf-unit">{elCommon.unit}</Label>
              <Select
                value={draft.unitId}
                onValueChange={(v) => patch({ unitId: v })}
              >
                <SelectTrigger id="bf-unit" aria-label="Φίλτρο μονάδας">
                  <SelectValue placeholder={elCommon.unit} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Όλες οι μονάδες</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {displayUnitName(u.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {elCommon.checkIn}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bf-cin-from">Από</Label>
                  <Input
                    id="bf-cin-from"
                    type="date"
                    value={draft.checkInFrom}
                    onChange={(e) => patch({ checkInFrom: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-cin-to">Έως</Label>
                  <Input
                    id="bf-cin-to"
                    type="date"
                    value={draft.checkInTo}
                    onChange={(e) => patch({ checkInTo: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {elCommon.checkOut}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bf-cout-from">Από</Label>
                  <Input
                    id="bf-cout-from"
                    type="date"
                    value={draft.checkOutFrom}
                    onChange={(e) => patch({ checkOutFrom: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-cout-to">Έως</Label>
                  <Input
                    id="bf-cout-to"
                    type="date"
                    value={draft.checkOutTo}
                    onChange={(e) => patch({ checkOutTo: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ημ. καταχώρησης (Talos)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bf-reg-from">Από</Label>
                  <Input
                    id="bf-reg-from"
                    type="date"
                    value={draft.registeredFrom}
                    onChange={(e) => patch({ registeredFrom: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-reg-to">Έως</Label>
                  <Input
                    id="bf-reg-to"
                    type="date"
                    value={draft.registeredTo}
                    onChange={(e) => patch({ registeredTo: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>

            {errors.length > 0 ? (
              <ul className="space-y-1 text-sm text-destructive">
                {errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mt-auto flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY_BOOKING_FILTERS);
                onClear();
                onOpenChange(false);
              }}
            >
              Καθαρισμός
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Ακύρωση
              </Button>
              <Button
                type="button"
                disabled={errors.length > 0}
                onClick={() => {
                  onApply(draft);
                  onOpenChange(false);
                }}
              >
                Εφαρμογή φίλτρων
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
