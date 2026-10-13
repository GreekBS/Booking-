"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import {
  fetchBookingDetail,
  fetchBookingStatusCounts,
  fetchPropertyUnitCatalog,
  flattenCatalogUnits,
  searchBookings,
  type BookingStatusCountsRecord,
} from "@/lib/admin/api";
import type { BookingRecord, CatalogPropertyRecord } from "@/lib/admin/types";
import type { SortDirection } from "@/lib/admin/utils";
import { formatOperatorDateOnly } from "@/lib/admin/money-presentation";
import { nightsBetween } from "@/lib/admin/utils";
import { PageHeader } from "@/components/admin/page-header";
import { Surface } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { RESERVATION_IMPORT_SUPERSEDED_BADGE } from "@/features/reservation-import/reservation-import-copy";
import { Pagination } from "@/components/admin/pagination";
import { BookingDetailDrawer } from "@/features/bookings/BookingDetailDrawer";
import { BookingCreateMenu } from "@/features/reservation-import/BookingCreateMenu";
import { ReservationImportDraftList } from "@/features/reservation-import/ReservationImportDraftList";
import {
  BookingFiltersSheet,
  countActiveBookingFilters,
  EMPTY_BOOKING_FILTERS,
  type BookingAdvancedFilters,
} from "@/features/bookings/BookingFiltersSheet";
import {
  BookingStatusTabs,
  type BookingStatusTabCounts,
  type BookingStatusTabId,
} from "@/features/bookings/BookingStatusTabs";
import { UnsavedChangesDialog } from "@/features/workspace/components/UnsavedChangesDialog";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bookingStatusPluralLabelEl,
  displayUnitName,
  elCommon,
  elNav,
} from "@/lib/i18n";

const PAGE_SIZE = 15;

const STATUS_TABS: BookingStatusTabId[] = [
  "all",
  "confirmed",
  "completed",
  "cancelled",
  "pending",
  "payment_pending",
];

type SortKey = "createdAt" | "checkIn" | "checkOut" | "guest" | "status";

function reservationCountLabel(total: number): string {
  return total === 1 ? "1 κράτηση" : `${total} κρατήσεις`;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function parseStatusTab(raw: string | null): BookingStatusTabId {
  if (raw && (STATUS_TABS as string[]).includes(raw)) {
    return raw as BookingStatusTabId;
  }
  return "all";
}

function parseSortKey(raw: string | null): SortKey {
  if (raw === "checkIn" || raw === "checkOut" || raw === "status" || raw === "createdAt") {
    return raw;
  }
  if (raw === "guestName" || raw === "guest") return "guest";
  return "checkIn";
}

function parseSortDir(raw: string | null): SortDirection {
  return raw === "asc" ? "asc" : "desc";
}

function emptyStatusCounts(): BookingStatusTabCounts {
  return {
    all: 0,
    pending: 0,
    payment_pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
  };
}

function toTabCounts(record: BookingStatusCountsRecord): BookingStatusTabCounts {
  return {
    all: record.all,
    pending: record.byStatus.pending,
    payment_pending: record.byStatus.payment_pending,
    confirmed: record.byStatus.confirmed,
    completed: record.byStatus.completed,
    cancelled: record.byStatus.cancelled,
  };
}

export function BookingsPage() {
  return (
    <WorkspaceProvider>
      <BookingsPageContent />
      <UnsavedChangesDialog />
    </WorkspaceProvider>
  );
}

function BookingsPageContent() {
  const { requestClose } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkBookingId = searchParams.get("bookingId");
  const deepLinkHandled = useRef<string | null>(null);
  const tableTopRef = useRef<HTMLDivElement | null>(null);
  const skipNextScrollRef = useRef(true);
  const urlHydratedRef = useRef(false);

  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const [properties, setProperties] = useState<CatalogPropertyRecord[]>([]);
  const [units, setUnits] = useState<
    Array<{ id: string; name: string; status: string; propertyId: string; propertyName: string }>
  >([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<BookingStatusTabCounts>(emptyStatusCounts);
  const [loading, setLoading] = useState(true);
  const [pageTransitioning, setPageTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const initializedRef = useRef(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusTab, setStatusTab] = useState<BookingStatusTabId>("all");
  const [advancedFilters, setAdvancedFilters] =
    useState<BookingAdvancedFilters>(EMPTY_BOOKING_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("checkIn");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<BookingRecord | null>(null);

  /** Hydrate list state from URL once (keeps Back/Forward + refresh working). */
  useEffect(() => {
    if (urlHydratedRef.current) return;
    urlHydratedRef.current = true;
    const sp = searchParams;
    setStatusTab(parseStatusTab(sp.get("status")));
    setSearch(sp.get("q") ?? "");
    setDebouncedSearch(sp.get("q") ?? "");
    setPage(Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1));
    setSortKey(parseSortKey(sp.get("sortBy")));
    setSortDir(parseSortDir(sp.get("sortDir")));
    setAdvancedFilters({
      unitId: sp.get("unitId") && sp.get("unitId") !== "all" ? sp.get("unitId")! : "all",
      checkInFrom: sp.get("checkInFrom") ?? "",
      checkInTo: sp.get("checkInTo") ?? "",
      checkOutFrom: sp.get("checkOutFrom") ?? "",
      checkOutTo: sp.get("checkOutTo") ?? "",
      registeredFrom: sp.get("registeredFrom") ?? "",
      registeredTo: sp.get("registeredTo") ?? "",
    });
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    initializedRef.current = false;
    setCatalogReady(false);
    setInitialized(false);
    setProperties([]);
    setUnits([]);
    setBookings([]);
    setTotal(0);
    setStatusCounts(emptyStatusCounts());
    setLoading(true);
    setError(null);
    setAdvancedFilters(EMPTY_BOOKING_FILTERS);
    setPage(1);
    skipNextScrollRef.current = true;
  }, [tenantId, propertyId]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function loadCatalog() {
      try {
        const catalog = await fetchPropertyUnitCatalog(tenantId!);
        if (cancelled) return;
        setProperties(catalog.properties);
        setUnits(flattenCatalogUnits(catalog));
        setCatalogReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης καταλόγου");
        setLoading(false);
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const filterQueryBase = useMemo(
    () => ({
      propertyId: propertyId ?? undefined,
      unitId: advancedFilters.unitId !== "all" ? advancedFilters.unitId : undefined,
      guestSearch: debouncedSearch || undefined,
      checkInFrom: advancedFilters.checkInFrom || undefined,
      checkInTo: advancedFilters.checkInTo || undefined,
      checkOutFrom: advancedFilters.checkOutFrom || undefined,
      checkOutTo: advancedFilters.checkOutTo || undefined,
      createdAtFrom: advancedFilters.registeredFrom || undefined,
      createdAtTo: advancedFilters.registeredTo || undefined,
      excludeSuperseded: true,
    }),
    [propertyId, advancedFilters, debouncedSearch],
  );

  const loadBookings = useCallback(async () => {
    if (!tenantId || !catalogReady || !propertyId) return;

    const isFirstLoad = !initializedRef.current;
    if (isFirstLoad) setLoading(true);
    else setPageTransitioning(true);
    setError(null);

    const sortByApi = sortKey === "guest" ? "guestName" : sortKey;

    try {
      const [result, counts] = await Promise.all([
        searchBookings(tenantId, {
          ...filterQueryBase,
          page,
          limit: PAGE_SIZE,
          sortBy: sortByApi,
          sortDir,
          status: statusTab !== "all" ? statusTab : undefined,
        }),
        fetchBookingStatusCounts(tenantId, filterQueryBase),
      ]);
      setBookings(result.data ?? []);
      setTotal(result.total ?? 0);
      setStatusCounts(toTabCounts(counts));
      initializedRef.current = true;
      setInitialized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης κρατήσεων");
    } finally {
      setLoading(false);
      setPageTransitioning(false);
    }
  }, [
    tenantId,
    catalogReady,
    propertyId,
    filterQueryBase,
    page,
    sortKey,
    sortDir,
    statusTab,
  ]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  /** Persist list filters in the URL (preserve bookingId deep-link). */
  useEffect(() => {
    if (!urlHydratedRef.current) return;
    const params = new URLSearchParams();
    if (deepLinkBookingId) params.set("bookingId", deepLinkBookingId);
    if (statusTab !== "all") params.set("status", statusTab);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (page > 1) params.set("page", String(page));
    if (sortKey !== "checkIn") params.set("sortBy", sortKey === "guest" ? "guestName" : sortKey);
    if (sortDir !== "desc") params.set("sortDir", sortDir);
    if (advancedFilters.unitId !== "all") params.set("unitId", advancedFilters.unitId);
    if (advancedFilters.checkInFrom) params.set("checkInFrom", advancedFilters.checkInFrom);
    if (advancedFilters.checkInTo) params.set("checkInTo", advancedFilters.checkInTo);
    if (advancedFilters.checkOutFrom) params.set("checkOutFrom", advancedFilters.checkOutFrom);
    if (advancedFilters.checkOutTo) params.set("checkOutTo", advancedFilters.checkOutTo);
    if (advancedFilters.registeredFrom) {
      params.set("registeredFrom", advancedFilters.registeredFrom);
    }
    if (advancedFilters.registeredTo) {
      params.set("registeredTo", advancedFilters.registeredTo);
    }
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (next !== current) {
      router.replace(next, { scroll: false });
    }
  }, [
    pathname,
    router,
    searchParams,
    deepLinkBookingId,
    statusTab,
    debouncedSearch,
    page,
    sortKey,
    sortDir,
    advancedFilters,
  ]);

  /** After a successful page change, scroll to the table header (not the whole dashboard). */
  useEffect(() => {
    if (!initialized || loading) return;
    if (skipNextScrollRef.current) {
      skipNextScrollRef.current = false;
      return;
    }
    const el = tableTopRef.current;
    if (!el) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, [page, initialized, loading, bookings]);

  function syncBookingUrl(bookingId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (bookingId) params.set("bookingId", bookingId);
    else params.delete("bookingId");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openBooking(booking: BookingRecord) {
    requestClose(() => {
      setSelected(booking);
      deepLinkHandled.current = booking.id;
      syncBookingUrl(booking.id);
    });
  }

  function closeBooking() {
    requestClose(() => {
      setSelected(null);
      deepLinkHandled.current = null;
      syncBookingUrl(null);
    });
  }

  useEffect(() => {
    if (!tenantId || !deepLinkBookingId) return;
    if (deepLinkHandled.current === deepLinkBookingId && selected?.id === deepLinkBookingId) {
      return;
    }
    let cancelled = false;
    async function openDeepLink() {
      try {
        const booking = await fetchBookingDetail(tenantId!, deepLinkBookingId!);
        if (cancelled) return;
        deepLinkHandled.current = deepLinkBookingId;
        setSelected(booking);
      } catch {
        /* list remains usable if deep-link fails */
      }
    }
    void openDeepLink();
    return () => {
      cancelled = true;
    };
  }, [tenantId, deepLinkBookingId, selected?.id]);

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const workspaceUnitOptions = useMemo(
    () =>
      units
        .filter(
          (u) =>
            u.propertyId === propertyId &&
            (u.status === "active" || u.id === selected?.unitId),
        )
        .map((u) => ({
          unitId: u.id,
          unitName: displayUnitName(u.name),
          propertyId: u.propertyId,
        })),
    [units, propertyId, selected?.unitId],
  );
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const filteredUnits = useMemo(
    () => units.filter((u) => u.propertyId === propertyId),
    [units, propertyId],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const advancedActiveCount = countActiveBookingFilters(advancedFilters);
  const searchActive = Boolean(debouncedSearch);
  const filtersActive = searchActive || advancedActiveCount > 0 || statusTab !== "all";

  function clearAllFilters() {
    skipNextScrollRef.current = true;
    setSearch("");
    setDebouncedSearch("");
    setStatusTab("all");
    setAdvancedFilters(EMPTY_BOOKING_FILTERS);
    setPage(1);
  }

  function changePage(next: number) {
    if (pageTransitioning || loading) return;
    if (next < 1 || next > totalPages || next === page) return;
    setPage(next);
  }

  function changeStatusTab(tab: BookingStatusTabId) {
    skipNextScrollRef.current = true;
    setStatusTab(tab);
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    skipNextScrollRef.current = true;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) {
      return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
    );
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
  if (loading && !initialized) return <Skeleton className="h-[520px] w-full" />;
  if (error && !initialized) {
    return <ErrorState message={error} onRetry={() => void loadBookings()} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={elNav.bookings}
        description={
          property
            ? `${reservationCountLabel(statusCounts.all)} · ${property.name}`
            : "Κέντρο κρατήσεων"
        }
        actions={<BookingCreateMenu />}
      />

      {tenantId && propertyId ? (
        <ReservationImportDraftList tenantId={tenantId} propertyId={propertyId} />
      ) : null}

      <Surface variant="panel" padding="sm" className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <BookingStatusTabs
            value={statusTab}
            counts={statusCounts}
            onChange={changeStatusTab}
            disabled={pageTransitioning}
          />
          <div className="flex flex-wrap items-center gap-2">
            <BookingFiltersSheet
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              applied={advancedFilters}
              units={filteredUnits.map((u) => ({ id: u.id, name: u.name }))}
              onApply={(next) => {
                skipNextScrollRef.current = true;
                setAdvancedFilters(next);
                setPage(1);
              }}
              onClear={() => {
                skipNextScrollRef.current = true;
                setAdvancedFilters(EMPTY_BOOKING_FILTERS);
                setPage(1);
              }}
            />
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <X className="h-3.5 w-3.5" />
                {elCommon.clearFilters}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadBookings()}
              disabled={loading || pageTransitioning}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading || pageTransitioning ? "animate-spin" : ""}`}
              />
              {elCommon.refresh}
            </Button>
          </div>
        </div>

        <div className="relative max-w-xl">
          <Label
            htmlFor="booking-search"
            className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            {elCommon.search}
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="booking-search"
              placeholder="Επισκέπτης, email, ID κράτησης…"
              value={search}
              onChange={(e) => {
                skipNextScrollRef.current = true;
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Προεπιλεγμένη ταξινόμηση: νεότερη άφιξη πρώτα (ανεξάρτητα από παρελθόν/μέλλον).
          {statusTab !== "all"
            ? ` Εμφάνιση: ${
                statusTab === "confirmed" ||
                statusTab === "completed" ||
                statusTab === "cancelled"
                  ? bookingStatusPluralLabelEl(statusTab)
                  : statusTab === "pending"
                    ? "Σε αναμονή"
                    : "Εκκρεμεί πληρωμή"
              }.`
            : null}
        </p>
      </Surface>

      {error && initialized ? (
        <ErrorState message={error} onRetry={() => void loadBookings()} />
      ) : null}

      <div ref={tableTopRef} className="scroll-mt-3" />

      {bookings.length === 0 && !loading && !pageTransitioning ? (
        <EmptyState
          title="Δεν βρέθηκαν κρατήσεις"
          description="Προσαρμόστε τα φίλτρα ή δημιουργήστε χειροκίνητη κράτηση."
          actions={<BookingCreateMenu align="center" />}
        />
      ) : (
        <Surface
          variant="panel"
          padding="none"
          className={loading || pageTransitioning ? "opacity-60" : ""}
          aria-busy={pageTransitioning || undefined}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => toggleSort("guest")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleSort("guest");
                    }}
                    tabIndex={0}
                  >
                    {elCommon.guest} <SortIcon column="guest" />
                  </TableHead>
                  <TableHead>Διαμονή / {elCommon.unit}</TableHead>
                  <TableHead
                    className="hidden cursor-pointer lg:table-cell"
                    title="Ημερομηνία καταχώρησης στο Talos (όχι αρχική ημερομηνία κράτησης καναλιού)"
                    onClick={() => toggleSort("createdAt")}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleSort("createdAt");
                    }}
                  >
                    {elCommon.registeredAt} <SortIcon column="createdAt" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => toggleSort("checkIn")}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleSort("checkIn");
                    }}
                  >
                    {elCommon.checkIn} <SortIcon column="checkIn" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => toggleSort("checkOut")}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleSort("checkOut");
                    }}
                  >
                    {elCommon.checkOut} <SortIcon column="checkOut" />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">{elCommon.nights}</TableHead>
                  <TableHead className="hidden sm:table-cell">{elCommon.guests}</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => toggleSort("status")}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleSort("status");
                    }}
                  >
                    {elCommon.status} <SortIcon column="status" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => {
                  const unit = unitMap.get(booking.unitId);
                  const propertyName = propertyMap.get(booking.propertyId)?.name;
                  const nights = nightsBetween(booking.checkIn, booking.checkOut);
                  return (
                    <TableRow
                      key={booking.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      aria-label={`Άνοιγμα κράτησης για ${booking.guest.name}`}
                      onClick={() => openBooking(booking)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openBooking(booking);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">{booking.guest.name}</div>
                        <div className="text-xs text-muted-foreground">{booking.guest.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{displayUnitName(unit?.name)}</div>
                        <div className="text-xs text-muted-foreground">{propertyName ?? "—"}</div>
                      </TableCell>
                      <TableCell className="hidden tabular-nums text-sm lg:table-cell">
                        {formatOperatorDateOnly(booking.createdAt)}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {formatOperatorDateOnly(booking.checkIn)}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {formatOperatorDateOnly(booking.checkOut)}
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">{nights}</TableCell>
                      <TableCell className="hidden sm:table-cell">{booking.guestCount}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={booking.status} />
                          {booking.isSuperseded ? (
                            <Badge
                              variant="outline"
                              className="rounded-md px-2 py-0.5 text-[13px] font-medium"
                              data-testid="booking-superseded-badge"
                            >
                              {RESERVATION_IMPORT_SUPERSEDED_BADGE}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border px-4 py-3">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={changePage}
              disabled={pageTransitioning || loading}
            />
          </div>
        </Surface>
      )}

      <BookingDetailDrawer
        booking={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) closeBooking();
        }}
        requestClose={requestClose}
        unitLabel={
          selected ? displayUnitName(unitMap.get(selected.unitId)?.name) : undefined
        }
        propertyLabel={selected ? propertyMap.get(selected.propertyId)?.name : undefined}
        unitOptions={workspaceUnitOptions}
        onUpdated={(updated) => {
          setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
          setSelected(updated);
        }}
      />
    </div>
  );
}
