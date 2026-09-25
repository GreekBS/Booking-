"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
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
  fetchPropertyUnitCatalog,
  flattenCatalogUnits,
  searchBookings,
} from "@/lib/admin/api";
import type { BookingRecord, CatalogPropertyRecord } from "@/lib/admin/types";
import type { SortDirection } from "@/lib/admin/utils";
import { nightsBetween } from "@/lib/admin/utils";
import { PageHeader } from "@/components/admin/page-header";
import { Surface } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Pagination } from "@/components/admin/pagination";
import { BookingDetailDrawer } from "@/features/bookings/BookingDetailDrawer";
import { UnsavedChangesDialog } from "@/features/workspace/components/UnsavedChangesDialog";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/context/WorkspaceContext";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 15;
type SortKey = "checkIn" | "checkOut" | "guest" | "status";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const initializedRef = useRef(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [arrivalFrom, setArrivalFrom] = useState("");
  const [arrivalTo, setArrivalTo] = useState("");
  const [departureFrom, setDepartureFrom] = useState("");
  const [departureTo, setDepartureTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("checkIn");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<BookingRecord | null>(null);

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
    setLoading(true);
    setError(null);
    setUnitFilter("all");
    setPage(1);
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
        setError(err instanceof Error ? err.message : "Failed to load catalog");
        setLoading(false);
      }
    }

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const loadBookings = useCallback(async () => {
    if (!tenantId || !catalogReady || !propertyId) return;

    const isFirstLoad = !initializedRef.current;
    if (isFirstLoad) setLoading(true);
    setError(null);

    try {
      const sortByApi = sortKey === "guest" ? "guestName" : sortKey;
      const result = await searchBookings(tenantId, {
        page,
        limit: PAGE_SIZE,
        sortBy: sortByApi,
        sortDir,
        guestSearch: debouncedSearch || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        propertyId,
        unitId: unitFilter !== "all" ? unitFilter : undefined,
        checkInFrom: arrivalFrom || undefined,
        checkInTo: arrivalTo || undefined,
        checkOutFrom: departureFrom || undefined,
        checkOutTo: departureTo || undefined,
      });
      setBookings(result.data ?? []);
      setTotal(result.total ?? 0);
      initializedRef.current = true;
      setInitialized(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [
    tenantId,
    catalogReady,
    propertyId,
    page,
    sortKey,
    sortDir,
    debouncedSearch,
    statusFilter,
    unitFilter,
    arrivalFrom,
    arrivalTo,
    departureFrom,
    departureTo,
  ]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

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

  /** Open booking workspace from deep-link (?bookingId=). */
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
        /* list remains usable if deep-link fails (ACL / not found) */
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
        .filter((u) => u.propertyId === propertyId)
        .map((u) => ({
          unitId: u.id,
          unitName: u.name,
          propertyId: u.propertyId,
        })),
    [units, propertyId],
  );
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const filteredUnits = useMemo(
    () => units.filter((u) => u.propertyId === propertyId),
    [units, propertyId],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtersActive =
    Boolean(debouncedSearch) ||
    statusFilter !== "all" ||
    unitFilter !== "all" ||
    Boolean(arrivalFrom) ||
    Boolean(arrivalTo) ||
    Boolean(departureFrom) ||
    Boolean(departureTo);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setUnitFilter("all");
    setArrivalFrom("");
    setArrivalTo("");
    setDepartureFrom("");
    setDepartureTo("");
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
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
  if (error && !initialized) return <ErrorState message={error} onRetry={() => void loadBookings()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookings"
        description={
          property
            ? `${total} reservation${total === 1 ? "" : "s"} · ${property.name}`
            : "Reservation center"
        }
        actions={
          <Button asChild size="sm">
            <Link href="/dashboard/bookings/new">
              <Plus className="h-4 w-4" />
              New booking
            </Link>
          </Button>
        }
      />

      <Surface variant="panel" padding="sm" className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative min-w-0 flex-1">
            <Label htmlFor="booking-search" className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="booking-search"
                placeholder="Guest, email, booking ID…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadBookings()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading && initialized ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="payment_pending">Payment pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Unit</Label>
            <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All units</SelectItem>
                {filteredUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="arrival-from" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Arrival from
            </Label>
            <Input id="arrival-from" type="date" value={arrivalFrom} onChange={(e) => { setArrivalFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="arrival-to" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Arrival to
            </Label>
            <Input id="arrival-to" type="date" value={arrivalTo} onChange={(e) => { setArrivalTo(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="departure-from" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Departure from
            </Label>
            <Input id="departure-from" type="date" value={departureFrom} onChange={(e) => { setDepartureFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="departure-to" className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Departure to
            </Label>
            <Input id="departure-to" type="date" value={departureTo} onChange={(e) => { setDepartureTo(e.target.value); setPage(1); }} />
          </div>
        </div>
      </Surface>

      {error && initialized ? (
        <ErrorState message={error} onRetry={() => void loadBookings()} />
      ) : null}

      {bookings.length === 0 && !loading ? (
        <EmptyState
          title="No bookings match"
          description="Adjust filters or create a manual reservation."
          action={{ label: "New booking", href: "/dashboard/bookings/new" }}
        />
      ) : (
        <Surface variant="panel" padding="none" className={loading && initialized ? "opacity-60" : ""}>
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
                    Guest <SortIcon column="guest" />
                  </TableHead>
                  <TableHead>Stay / Unit</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => toggleSort("checkIn")}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleSort("checkIn");
                    }}
                  >
                    Arrival <SortIcon column="checkIn" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => toggleSort("checkOut")}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleSort("checkOut");
                    }}
                  >
                    Departure <SortIcon column="checkOut" />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Nights</TableHead>
                  <TableHead className="hidden sm:table-cell">Guests</TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => toggleSort("status")}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleSort("status");
                    }}
                  >
                    Status <SortIcon column="status" />
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
                      aria-label={`Open reservation for ${booking.guest.name}`}
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
                        <div className="text-sm">{unit?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{propertyName ?? "—"}</div>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">{booking.checkIn}</TableCell>
                      <TableCell className="tabular-nums text-sm">{booking.checkOut}</TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">{nights}</TableCell>
                      <TableCell className="hidden sm:table-cell">{booking.guestCount}</TableCell>
                      <TableCell>
                        <StatusBadge status={booking.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border px-4 py-3">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
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
        unitLabel={selected ? unitMap.get(selected.unitId)?.name : undefined}
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
