"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import {
  createOperatorBlock,
  fetchAllProperties,
  fetchAvailabilityRules,
  fetchBookingDetail,
  fetchHoldDetail,
  fetchRatePlan,
  fetchUnitCalendar,
  releaseOperatorBlock,
  updateAvailabilityRules,
} from "@/lib/admin/api";
import type {
  AvailabilityRulesRecord,
  BookingRecord,
  CalendarRecord,
  HoldRecord,
  OperatorBlockType,
  PropertyRecord,
  RatePlanRecord,
} from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { BookingDetailDrawer } from "@/features/bookings/BookingDetailDrawer";
import { UnsavedChangesDialog } from "@/features/workspace/components/UnsavedChangesDialog";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { HoldDetailDrawer } from "./components/drawers/HoldDetailDrawer";
import { OperatorBlockDrawer } from "./components/drawers/OperatorBlockDrawer";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_RANGE_DAYS,
  addDaysIso,
  buildDateRange,
  normalizeSelectionRange,
  rangesOverlap,
  todayIso,
} from "./lib/calendar-utils";
import { resolveCellState } from "./lib/cell-state";
import { AvailabilityToolbar } from "./components/AvailabilityToolbar";
import { AvailabilityCalendarGrid } from "./components/AvailabilityCalendarGrid";
import { SelectionActionBar } from "./components/SelectionActionBar";
import { AvailabilityInteractionProvider } from "./context/AvailabilityInteractionContext";
import type { CellContextActions } from "./context/AvailabilityInteractionContext";
import { usePropertyCollapse } from "./hooks/usePropertyCollapse";
import { focusDateAfterTodayJump, useCalendarKeyboard } from "./hooks/useCalendarKeyboard";
import { getActionRange, isDateInSelection } from "./lib/selection-utils";
import type { UnitMeta, CalendarSelection, CalendarFocus, OverlayToggles } from "./types";
import { DEFAULT_OVERLAY_TOGGLES, hasAnyRestrictionOverlay } from "./types";

const CONCURRENCY = 4;

export function AvailabilityPage() {
  return (
    <WorkspaceProvider>
      <AvailabilityPageContent />
      <UnsavedChangesDialog />
    </WorkspaceProvider>
  );
}

function AvailabilityPageContent() {
  const { requestClose } = useWorkspace();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [unitSearch, setUnitSearch] = useState("");
  const [rangeStart, setRangeStart] = useState(() => todayIso());
  const [rangeDays, setRangeDays] = useState(DEFAULT_RANGE_DAYS);
  const [overlayToggles, setOverlayToggles] = useState<OverlayToggles>(DEFAULT_OVERLAY_TOGGLES);

  const [calendars, setCalendars] = useState<Record<string, CalendarRecord>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<string, boolean>>({});
  const [rulesByUnit, setRulesByUnit] = useState<Record<string, AvailabilityRulesRecord>>({});
  const [ratesByUnit, setRatesByUnit] = useState<Record<string, RatePlanRecord | null>>({});

  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const [focus, setFocus] = useState<CalendarFocus | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ unitId: string; anchor: string } | null>(null);
  const dragMovedRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const [blockDialog, setBlockDialog] = useState(false);
  const [blockForm, setBlockForm] = useState({
    unitId: "",
    checkIn: "",
    checkOut: "",
    blockType: "manual" as OperatorBlockType,
    reason: "",
    editingBlockId: null as string | null,
  });

  const [bookingDrawer, setBookingDrawer] = useState<{
    booking: BookingRecord;
    unitLabel: string;
    propertyLabel: string;
  } | null>(null);
  const [holdDrawer, setHoldDrawer] = useState<{
    hold: HoldRecord;
    unitLabel: string;
    propertyLabel: string;
  } | null>(null);
  const [operatorBlockDrawer, setOperatorBlockDrawer] = useState<{
    block: CalendarRecord["blocks"][number];
    unitId: string;
    unitLabel: string;
    propertyLabel: string;
  } | null>(null);
  const [blockDeleteConfirm, setBlockDeleteConfirm] = useState<{
    blockId: string;
    unitId: string;
  } | null>(null);
  const [minStayDialog, setMinStayDialog] = useState(false);
  const [minStayValue, setMinStayValue] = useState(1);

  const rangeEnd = addDaysIso(rangeStart, rangeDays);
  const dates = useMemo(() => buildDateRange(rangeStart, rangeDays), [rangeStart, rangeDays]);
  const today = todayIso();

  const units = useMemo((): UnitMeta[] => {
    if (!propertyId) return [];
    const list: UnitMeta[] = [];
    for (const p of properties) {
      if (p.id !== propertyId) continue;
      for (const u of p.units) {
        list.push({
          unitId: u.id,
          unitName: u.name,
          propertyId: p.id,
          propertyName: p.name,
        });
      }
    }
    return list;
  }, [properties, propertyId]);

  const { isCollapsed: isPropertyCollapsed, toggle: togglePropertyCollapse } =
    usePropertyCollapse(tenantId);

  const visibleUnits = useMemo((): UnitMeta[] => {
    if (!propertyId) return [];
    const search = unitSearch.trim().toLowerCase();
    const list: UnitMeta[] = [];
    for (const p of properties) {
      if (p.id !== propertyId) continue;
      if (isPropertyCollapsed(p.id)) continue;
      for (const u of p.units) {
        if (search && !u.name.toLowerCase().includes(search)) continue;
        list.push({
          unitId: u.id,
          unitName: u.name,
          propertyId: p.id,
          propertyName: p.name,
        });
      }
    }
    return list;
  }, [properties, propertyId, unitSearch, isPropertyCollapsed]);

  const loadCatalog = useCallback(async () => {
    if (!tenantId) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await fetchAllProperties(tenantId, 1, 100);
      setProperties(res.data);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Failed to load properties");
    } finally {
      setCatalogLoading(false);
    }
  }, [tenantId]);

  const loadUnitCalendar = useCallback(
    async (unitId: string) => {
      if (!tenantId) return;
      setLoadingUnits((prev) => ({ ...prev, [unitId]: true }));
      try {
        const data = await fetchUnitCalendar(tenantId, unitId, rangeStart, rangeEnd);
        setCalendars((prev) => ({ ...prev, [unitId]: data }));
      } catch {
        setCalendars((prev) => ({
          ...prev,
          [unitId]: prev[unitId] ?? { blocks: [], holds: [], bookings: [] },
        }));
      } finally {
        setLoadingUnits((prev) => ({ ...prev, [unitId]: false }));
      }
    },
    [tenantId, rangeStart, rangeEnd],
  );

  const loadUnitMeta = useCallback(
    async (unitId: string, loadRules: boolean, loadRates: boolean) => {
      if (!tenantId) return;
      if (loadRules) {
        try {
          const rules = await fetchAvailabilityRules(tenantId, unitId);
          setRulesByUnit((prev) => ({ ...prev, [unitId]: rules }));
        } catch {
          /* optional overlay */
        }
      }
      if (loadRates) {
        try {
          const plan = await fetchRatePlan(tenantId, unitId);
          setRatesByUnit((prev) => ({ ...prev, [unitId]: plan }));
        } catch {
          setRatesByUnit((prev) => ({ ...prev, [unitId]: null }));
        }
      }
    },
    [tenantId],
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setSelection(null);
    setFocus(null);
  }, [propertyId]);

  useEffect(() => {
    if (!tenantId || units.length === 0) return;
    let cancelled = false;
    const queue = [...units.map((u) => u.unitId)];
    let active = 0;

    async function pump() {
      while (queue.length > 0 && !cancelled) {
        if (active >= CONCURRENCY) {
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        const unitId = queue.shift()!;
        active += 1;
        void loadUnitCalendar(unitId).finally(() => {
          active -= 1;
        });
        void loadUnitMeta(unitId, hasAnyRestrictionOverlay(overlayToggles), overlayToggles.price);
      }
    }
    void pump();
    return () => {
      cancelled = true;
    };
  }, [tenantId, units, rangeStart, rangeEnd, overlayToggles, loadUnitCalendar, loadUnitMeta]);

  useEffect(() => {
    if (!tenantId) return;
    for (const u of units) {
      if (hasAnyRestrictionOverlay(overlayToggles)) void loadUnitMeta(u.unitId, true, false);
      if (overlayToggles.price) void loadUnitMeta(u.unitId, false, true);
    }
  }, [tenantId, units, overlayToggles, loadUnitMeta]);

  function shiftRange(days: number) {
    setRangeStart((s) => addDaysIso(s, days));
  }

  function goToday() {
    setRangeStart(todayIso());
  }

  function openBlockDialog(
    unitId: string,
    from: string,
    to: string,
    blockType: OperatorBlockType = "manual",
  ) {
    const normalized = normalizeSelectionRange(from, to);
    setBlockForm({
      unitId,
      checkIn: normalized.from,
      checkOut: normalized.to,
      blockType,
      reason: "",
      editingBlockId: null,
    });
    setBlockDialog(true);
  }

  async function createBlockForRange(
    unitId: string,
    from: string,
    to: string,
    blockType: OperatorBlockType,
  ) {
    if (!tenantId) return;
    const normalized = normalizeSelectionRange(from, to);
    if (normalized.from >= normalized.to) {
      toastError("Check-out must be after check-in");
      return;
    }
    try {
      await createOperatorBlock(tenantId, unitId, {
        checkIn: normalized.from,
        checkOut: normalized.to,
        blockType,
        reason: null,
      });
      toastSuccess(`${blockType.replace("_", " ")} block created`);
      await loadUnitCalendar(unitId);
      setSelection(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create block");
    }
  }

  async function submitBlock() {
    if (!tenantId || !blockForm.unitId) return;
    if (blockForm.checkIn >= blockForm.checkOut) {
      toastError("Check-out must be after check-in");
      return;
    }
    try {
      if (blockForm.editingBlockId) {
        await releaseOperatorBlock(tenantId, blockForm.unitId, blockForm.editingBlockId);
      }
      await createOperatorBlock(tenantId, blockForm.unitId, {
        checkIn: blockForm.checkIn,
        checkOut: blockForm.checkOut,
        blockType: blockForm.blockType,
        reason: blockForm.reason || null,
      });
      toastSuccess(blockForm.editingBlockId ? "Block updated" : "Dates blocked");
      setBlockDialog(false);
      setOperatorBlockDrawer(null);
      await loadUnitCalendar(blockForm.unitId);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create block");
    }
  }

  async function openDatesForRange(unitId: string, from: string, to: string) {
    if (!tenantId) return;
    const cal = calendars[unitId];
    if (!cal) return;
    const normalized = normalizeSelectionRange(from, to);
    const blocks = cal.blocks.filter(
      (b) =>
        b.status === "active" &&
        OPERATOR_BLOCK_TYPES.includes(b.blockType as OperatorBlockType) &&
        rangesOverlap(b.checkIn, b.checkOut, normalized.from, normalized.to),
    );
    try {
      await Promise.all(
        blocks.map((b) => releaseOperatorBlock(tenantId, unitId, b.id)),
      );
      toastSuccess(blocks.length ? "Dates opened" : "No blocks to release");
      await loadUnitCalendar(unitId);
      setSelection(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to release blocks");
    }
  }

  async function openDatesInSelection() {
    if (!selection) return;
    const { from, to } = getActionRange(selection.unitId, selection.from, selection);
    await openDatesForRange(selection.unitId, from, to);
  }

  async function saveMinStay() {
    if (!tenantId || !selection) return;
    try {
      const existing =
        rulesByUnit[selection.unitId] ??
        (await fetchAvailabilityRules(tenantId, selection.unitId));
      const updated = await updateAvailabilityRules(tenantId, selection.unitId, {
        ...existing,
        minNights: minStayValue,
      });
      setRulesByUnit((prev) => ({ ...prev, [selection.unitId]: updated }));
      toastSuccess("Minimum stay updated");
      setMinStayDialog(false);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to update rules");
    }
  }

  function handleCellMouseDown(unitId: string, date: string) {
    dragRef.current = { unitId, anchor: date };
    dragMovedRef.current = false;
    setIsDragging(true);
    setSelection({ unitId, from: date, to: date });
    setFocus({ unitId, date });
  }

  function handleCellMouseEnter(unitId: string, date: string) {
    const drag = dragRef.current;
    if (!drag || drag.unitId !== unitId) return;
    if (date !== drag.anchor) dragMovedRef.current = true;
    setSelection({ unitId, from: drag.anchor, to: date });
  }

  useEffect(() => {
    function onUp() {
      if (dragRef.current) {
        setIsDragging(false);
      }
      dragRef.current = null;
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  function clearSelectionAndFocus() {
    setSelection(null);
    setFocus(null);
    setIsDragging(false);
    dragRef.current = null;
  }

  async function handleCellClick(unit: UnitMeta, date: string) {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    if (!tenantId) return;
    const cal = calendars[unit.unitId];
    const state = resolveCellState(cal, date, rulesByUnit[unit.unitId]);

    if (state.bookingId) {
      try {
        const detail = await fetchBookingDetail(tenantId, state.bookingId);
        requestClose(() =>
          setBookingDrawer({
            booking: detail,
            unitLabel: unit.unitName,
            propertyLabel: unit.propertyName,
          }),
        );
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to load booking");
      }
      return;
    }

    if (state.holdId && cal) {
      const h = cal.holds.find((x) => x.id === state.holdId);
      if (h) {
        try {
          const detail = await fetchHoldDetail(tenantId, h.id);
          setHoldDrawer({
            hold: detail,
            unitLabel: unit.unitName,
            propertyLabel: unit.propertyName,
          });
        } catch {
          setHoldDrawer({
            hold: {
              id: h.id,
              tenantId,
              unitId: unit.unitId,
              propertyId: unit.propertyId,
              checkIn: h.checkIn,
              checkOut: h.checkOut,
              guestCount: 0,
              status: h.status,
              expiresAt: h.expiresAt,
              sessionRef: null,
            },
            unitLabel: unit.unitName,
            propertyLabel: unit.propertyName,
          });
        }
      }
      return;
    }

    if (state.blockId && cal) {
      const b = cal.blocks.find((x) => x.id === state.blockId);
      if (
        b &&
        OPERATOR_BLOCK_TYPES.includes(b.blockType as OperatorBlockType)
      ) {
        setOperatorBlockDrawer({
          block: b,
          unitId: unit.unitId,
          unitLabel: unit.unitName,
          propertyLabel: unit.propertyName,
        });
      }
      return;
    }

    if (state.type === "available" || state.type === "closed") {
      openBlockDialog(unit.unitId, date, date);
    }
  }

  function isSelected(unitId: string, date: string) {
    return isDateInSelection(selection, unitId, date);
  }

  function isFocused(unitId: string, date: string) {
    return focus?.unitId === unitId && focus.date === date;
  }

  const cellActions: CellContextActions = useMemo(
    () => ({
      onBlockDates: (unit, date) => {
        const range = getActionRange(unit.unitId, date, selection);
        openBlockDialog(unit.unitId, range.from, range.to, "manual");
      },
      onOpenDates: (unit, date) => {
        const range = getActionRange(unit.unitId, date, selection);
        void openDatesForRange(unit.unitId, range.from, range.to);
      },
      onCreateBlockType: (unit, date, blockType) => {
        const range = getActionRange(unit.unitId, date, selection);
        void createBlockForRange(unit.unitId, range.from, range.to, blockType);
      },
      onViewReservation: (unit, date) => {
        void handleCellClick(unit, date);
      },
      onReleaseHold: (unit, date) => {
        void handleCellClick(unit, date);
      },
      onReleaseBlock: (unit, date) => {
        void handleCellClick(unit, date);
      },
    }),
    [selection, tenantId, calendars],
  );

  const interactionValue = useMemo(
    () => ({
      selection,
      isDragging,
      focus,
      setFocus,
      clearSelection: clearSelectionAndFocus,
      isSelected,
      isFocused,
      onCellMouseDown: handleCellMouseDown,
      onCellMouseEnter: handleCellMouseEnter,
      onCellClick: handleCellClick,
      cellActions,
    }),
    [selection, isDragging, focus, cellActions],
  );

  useCalendarKeyboard({
    enabled: Boolean(tenantId) && visibleUnits.length > 0,
    dates,
    units: visibleUnits,
    focus,
    setFocus,
    onEnter: (unit, date) => void handleCellClick(unit, date),
    onEscape: clearSelectionAndFocus,
    onTodayShortcut: () => {
      goToday();
      const unitId = focus?.unitId ?? visibleUnits[0]?.unitId;
      if (unitId) focusDateAfterTodayJump(dates, today, setFocus, unitId);
    },
    gridRef,
  });

  useEffect(() => {
    if (!focus) return;
    const el = gridRef.current?.querySelector(
      `[data-unit-id="${focus.unitId}"][data-date="${focus.date}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focus]);

  const selectionUnitLabel =
    selection && units.find((u) => u.unitId === selection.unitId)?.unitName;

  function handleRefresh() {
    units.forEach((u) => void loadUnitCalendar(u.unitId));
  }

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties: activeProperties,
  });
  if (propertyGate) return propertyGate;

  if (catalogLoading && properties.length === 0) {
    return <Skeleton className="h-[520px] w-full" />;
  }

  if (units.length === 0) {
    return (
      <EmptyState
        title="No units to display"
        description="Create a property and unit to manage availability."
        action={{ label: "Go to properties", href: "/dashboard/properties", onClick: () => {} }}
      />
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-col gap-3">
        <PageHeader
          title="Availability"
          description="Operational calendar — blocks, bookings, holds, and rates"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => selection && openBlockDialog(selection.unitId, selection.from, selection.to)}
              disabled={!selection}
            >
              <Lock className="h-4 w-4" />
              Block selection
            </Button>
          }
        />

        <AvailabilityToolbar
          activePropertyName={property?.name}
          unitSearch={unitSearch}
          onUnitSearchChange={setUnitSearch}
          rangeStart={rangeStart}
          onRangeStartChange={setRangeStart}
          rangeDays={rangeDays}
          onRangeDaysChange={setRangeDays}
          overlays={overlayToggles}
          onOverlayChange={(key, value) =>
            setOverlayToggles((prev) => ({ ...prev, [key]: value }))
          }
          onToday={goToday}
          onShiftRange={shiftRange}
          onRefresh={handleRefresh}
        />

        {catalogError && <ErrorState message={catalogError} onRetry={() => void loadCatalog()} />}

        <AvailabilityInteractionProvider value={interactionValue}>
          <AvailabilityCalendarGrid
            gridRef={gridRef}
            properties={properties}
            propertyId={propertyId!}
            unitSearch={unitSearch}
            dates={dates}
            today={today}
            overlays={overlayToggles}
            calendars={calendars}
            loadingUnits={loadingUnits}
            rulesByUnit={rulesByUnit}
            ratesByUnit={ratesByUnit}
            isPropertyCollapsed={isPropertyCollapsed}
            onTogglePropertyCollapse={togglePropertyCollapse}
            selectionBar={
              selection && selectionUnitLabel ? (
                <SelectionActionBar
                  selection={selection}
                  unitLabel={selectionUnitLabel}
                  isDragging={isDragging}
                  onBlock={() => openBlockDialog(selection.unitId, selection.from, selection.to)}
                  onOpen={() => void openDatesInSelection()}
                  onBlockType={(type) =>
                    void createBlockForRange(
                      selection.unitId,
                      selection.from,
                      selection.to,
                      type,
                    )
                  }
                  onMinStay={() => {
                    setMinStayValue(rulesByUnit[selection.unitId]?.minNights ?? 1);
                    setMinStayDialog(true);
                  }}
                  onCancel={clearSelectionAndFocus}
                />
              ) : undefined
            }
          />
        </AvailabilityInteractionProvider>

        <Dialog open={blockDialog} onOpenChange={setBlockDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{blockForm.editingBlockId ? "Edit block" : "Block dates"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Block type</Label>
                <Select
                  value={blockForm.blockType}
                  onValueChange={(v) => setBlockForm({ ...blockForm, blockType: v as OperatorBlockType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATOR_BLOCK_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Check-in</Label>
                  <Input
                    type="date"
                    value={blockForm.checkIn}
                    onChange={(e) => setBlockForm({ ...blockForm, checkIn: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Check-out</Label>
                  <Input
                    type="date"
                    value={blockForm.checkOut}
                    onChange={(e) => setBlockForm({ ...blockForm, checkOut: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBlockDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => void submitBlock()}>
                {blockForm.editingBlockId ? "Save changes" : "Create block"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={minStayDialog} onOpenChange={setMinStayDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Minimum stay (unit-wide)</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Updates availability rules for the selected unit. Per-date min stay is not yet supported.
            </p>
            <Input
              type="number"
              min={1}
              value={minStayValue}
              onChange={(e) => setMinStayValue(Number(e.target.value))}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setMinStayDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => void saveMinStay()}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={Boolean(blockDeleteConfirm)}
          onOpenChange={(open) => !open && setBlockDeleteConfirm(null)}
          title="Delete block"
          description="Remove this block and reopen the dates?"
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            if (!tenantId || !blockDeleteConfirm) return;
            try {
              await releaseOperatorBlock(
                tenantId,
                blockDeleteConfirm.unitId,
                blockDeleteConfirm.blockId,
              );
              await loadUnitCalendar(blockDeleteConfirm.unitId);
              toastSuccess("Block deleted");
              setOperatorBlockDrawer(null);
            } catch (err) {
              toastError(err instanceof Error ? err.message : "Failed to delete block");
            }
            setBlockDeleteConfirm(null);
          }}
        />

        <BookingDetailDrawer
          booking={bookingDrawer?.booking ?? null}
          unitLabel={bookingDrawer?.unitLabel}
          propertyLabel={bookingDrawer?.propertyLabel}
          open={Boolean(bookingDrawer)}
          onOpenChange={(open) => {
            if (!open) {
              requestClose(() => setBookingDrawer(null));
            }
          }}
          requestClose={requestClose}
          onUpdated={(updated) => {
            setBookingDrawer((prev) => (prev ? { ...prev, booking: updated } : null));
            if (updated.unitId) void loadUnitCalendar(updated.unitId);
          }}
        />

        <HoldDetailDrawer
          hold={holdDrawer?.hold ?? null}
          unitLabel={holdDrawer?.unitLabel}
          propertyLabel={holdDrawer?.propertyLabel}
          open={Boolean(holdDrawer)}
          onOpenChange={(open) => !open && setHoldDrawer(null)}
          onReleased={() => {
            if (holdDrawer) void loadUnitCalendar(holdDrawer.hold.unitId);
          }}
        />

        <OperatorBlockDrawer
          block={operatorBlockDrawer?.block ?? null}
          unitLabel={operatorBlockDrawer?.unitLabel}
          propertyLabel={operatorBlockDrawer?.propertyLabel}
          open={Boolean(operatorBlockDrawer)}
          onOpenChange={(open) => !open && setOperatorBlockDrawer(null)}
          onEdit={(block) => {
            if (!operatorBlockDrawer) return;
            setBlockForm({
              unitId: operatorBlockDrawer.unitId,
              checkIn: block.checkIn,
              checkOut: block.checkOut,
              blockType: block.blockType as OperatorBlockType,
              reason: block.reason ?? "",
              editingBlockId: block.id,
            });
            setBlockDialog(true);
          }}
          onDelete={(block) => {
            if (!operatorBlockDrawer) return;
            setBlockDeleteConfirm({
              blockId: block.id,
              unitId: operatorBlockDrawer.unitId,
            });
          }}
        />
      </div>
    </TooltipProvider>
  );
}
