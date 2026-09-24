"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { fetchPropertyUnitCatalog } from "@/lib/admin/api";
import type { CatalogPropertyRecord } from "@/lib/admin/types";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MONTHS_INITIAL, MONTHS_LOAD_MORE } from "./constants";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { CalendarActionsProvider } from "./context/CalendarActionsContext";
import { OverlayProvider, useOverlays } from "./context/OverlayContext";
import {
  TimelineInteractionProvider,
  useTimelineInteraction,
} from "./context/TimelineInteractionContext";
import { CalendarOpsBar } from "./components/shell/CalendarOpsBar";
import { ExtranetCalendarShell } from "./components/shell/ExtranetCalendarShell";
import { buildMonthGridModel, startOfMonthIso } from "./lib/month-grid-model";
import { todayIso } from "./lib/timeline-model";
import { countCatalogUnits, useRackGroup } from "./lib/rack-model";
import { useSelectedUnit } from "./hooks/useSelectedUnit";
import { useUnitAvailabilityRules } from "./hooks/useUnitAvailabilityRules";
import { useUnitCalendars } from "./hooks/useUnitCalendars";
import { useUnitRatePlans } from "./hooks/useUnitRatePlans";
import { DEFAULT_DENSITY, type CalendarDensity } from "./lib/density";

function ExtranetCalendarContent() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId: selectedPropertyId,
    setActiveProperty,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const { overlays, toggleOverlay } = useOverlays();
  const { closeWorkspace, openDateWorkspace } = useWorkspace();
  const { clearSelection } = useTimelineInteraction();

  const [properties, setProperties] = useState<CatalogPropertyRecord[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadedMonthCount, setLoadedMonthCount] = useState(MONTHS_INITIAL);
  const [anchorMonth] = useState(() => startOfMonthIso(todayIso()));
  const [density, setDensity] = useState<CalendarDensity>(DEFAULT_DENSITY);

  const loadCatalog = useCallback(async () => {
    if (!tenantId) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const catalog = await fetchPropertyUnitCatalog(tenantId);
      setProperties(catalog.properties);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Failed to load properties");
    } finally {
      setCatalogLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const propertyGroup = useRackGroup(properties, selectedPropertyId, "");
  const unitIds = useMemo(() => propertyGroup?.catalogUnitIds ?? [], [propertyGroup]);
  const units = useMemo(() => propertyGroup?.units ?? [], [propertyGroup]);

  const { selectedUnitId, setSelectedUnitId, ready: unitSelectionReady } = useSelectedUnit(
    tenantId,
    selectedPropertyId,
    unitIds,
  );

  const selectedUnit = useMemo(
    () => units.find((u) => u.unitId === selectedUnitId) ?? null,
    [units, selectedUnitId],
  );

  const monthGrid = useMemo(
    () => buildMonthGridModel(anchorMonth, loadedMonthCount),
    [anchorMonth, loadedMonthCount],
  );

  const { rulesByUnit, patchRulesForUnit } = useUnitAvailabilityRules(tenantId, unitIds);
  const { calendarsByUnit, loadingUnits, refreshCalendars, isRefreshing, lastUpdatedAt } =
    useUnitCalendars(tenantId, unitIds, monthGrid.rangeStart, monthGrid.rangeEnd);
  const { ratePlansByUnit, loadingRatePlans, refreshRatePlans, patchRatePlanForUnit } =
    useUnitRatePlans(tenantId, unitIds, true);

  const groups = useMemo(() => (propertyGroup ? [propertyGroup] : []), [propertyGroup]);

  const catalogUnitCount = useMemo(
    () => countCatalogUnits(properties, selectedPropertyId),
    [properties, selectedPropertyId],
  );

  const catalogHasProperties = properties.length > 0;

  const handleSelectedPropertyChange = useCallback(
    (propertyId: string) => {
      if (propertyId === selectedPropertyId) return;
      closeWorkspace();
      clearSelection();
      setLoadedMonthCount(MONTHS_INITIAL);
      setActiveProperty(propertyId);
    },
    [selectedPropertyId, closeWorkspace, clearSelection, setActiveProperty],
  );

  const handleSelectedUnitChange = useCallback(
    (unitId: string) => {
      if (unitId === selectedUnitId) return;
      closeWorkspace();
      clearSelection();
      setSelectedUnitId(unitId);
    },
    [selectedUnitId, closeWorkspace, clearSelection, setSelectedUnitId],
  );

  function goToday() {
    const el = document.querySelector(
      `[data-calendar-cell="true"][data-date="${todayIso()}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function handleLoadMore() {
    setLoadedMonthCount((count) => count + MONTHS_LOAD_MORE);
  }

  function handleRefresh() {
    void loadCatalog();
    refreshCalendars();
    refreshRatePlans();
  }

  const propertyGate = renderActivePropertyGate(
    {
      tenantLoading,
      tenantError,
      tenantId,
      propertyReady,
      propertyError,
      propertyId: selectedPropertyId,
      properties: activeProperties,
    },
    { skeletonClassName: "h-full w-full rounded-none" },
  );
  if (propertyGate) return propertyGate;

  if (catalogLoading && properties.length === 0) {
    return <Skeleton className="h-full w-full rounded-none" />;
  }

  if (!catalogHasProperties && !catalogLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          title="Create your first property"
          description="Add a property to start managing rooms on the availability calendar."
          action={{ label: "Go to properties", href: "/dashboard/properties", onClick: () => {} }}
        />
      </div>
    );
  }

  if (!unitSelectionReady) {
    return <Skeleton className="h-full w-full rounded-none" />;
  }

  const selectedRules = selectedUnitId ? rulesByUnit[selectedUnitId] : undefined;
  const selectedCalendar = selectedUnitId ? calendarsByUnit[selectedUnitId] : undefined;
  const selectedLoading = selectedUnitId ? Boolean(loadingUnits[selectedUnitId]) : false;
  const selectedRatePlanReady = selectedUnitId != null && selectedUnitId in ratePlansByUnit;
  const selectedRatePlanLoading = selectedUnitId ? Boolean(loadingRatePlans[selectedUnitId]) : false;
  const selectedRatePlan = selectedRatePlanReady
    ? (ratePlansByUnit[selectedUnitId] ?? null)
    : undefined;

  return (
    <CalendarActionsProvider
      refreshCalendars={refreshCalendars}
      refreshRatePlans={refreshRatePlans}
      calendarsByUnit={calendarsByUnit}
      rulesByUnit={rulesByUnit}
      ratePlansByUnit={ratePlansByUnit}
      patchRulesForUnit={patchRulesForUnit}
      patchRatePlanForUnit={patchRatePlanForUnit}
      groups={groups}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <CalendarOpsBar
          properties={properties}
          selectedPropertyId={selectedPropertyId}
          onSelectedPropertyChange={handleSelectedPropertyChange}
          units={units}
          selectedUnitId={selectedUnitId}
          onSelectedUnitChange={handleSelectedUnitChange}
          density={density}
          onDensityChange={setDensity}
          overlays={overlays}
          onOverlayToggle={toggleOverlay}
          onToday={goToday}
          onRefresh={handleRefresh}
          onOpenManualEdit={openDateWorkspace}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
        />

        {catalogError && (
          <div className="shrink-0 border-b px-3 py-2">
            <ErrorState message={catalogError} onRetry={() => void loadCatalog()} />
          </div>
        )}

        <ExtranetCalendarShell
          sections={monthGrid.sections}
          dates={monthGrid.dates}
          today={monthGrid.today}
          selectedPropertyId={selectedPropertyId}
          selectedUnit={selectedUnit}
          catalogUnitCount={catalogUnitCount}
          groups={groups}
          density={density}
          rules={selectedRules}
          calendar={selectedCalendar}
          loading={selectedLoading}
          overlays={overlays}
          ratePlan={selectedRatePlan}
          ratePlanReady={selectedRatePlanReady}
          ratePlanLoading={selectedRatePlanLoading}
          onLoadMore={handleLoadMore}
          onToday={goToday}
          onRefresh={handleRefresh}
          units={units}
          selectedUnitId={selectedUnitId}
        />
      </div>
    </CalendarActionsProvider>
  );
}

function ExtranetCalendarPageInner() {
  const { openDateWorkspace } = useWorkspace();

  return (
    <TimelineInteractionProvider
      onSelectionCommitted={() => {
        openDateWorkspace();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ExtranetCalendarContent />
      </div>
    </TimelineInteractionProvider>
  );
}

export function ExtranetCalendarPage() {
  return (
    <WorkspaceProvider>
      <OverlayProvider>
        <ExtranetCalendarPageInner />
      </OverlayProvider>
    </WorkspaceProvider>
  );
}
