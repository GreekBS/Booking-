"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, RefreshCw, Search } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { fetchPropertyUnitCatalog, flattenCatalogUnits, searchBookings } from "@/lib/admin/api";
import type { BookingRecord, CatalogPropertyRecord } from "@/lib/admin/types";
import type { SortDirection } from "@/lib/admin/utils";
import { PageHeader } from "@/components/admin/page-header";
import { StickyToolbar } from "@/components/admin/sticky-toolbar";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Pagination } from "@/components/admin/pagination";
import { BookingDetailDrawer } from "@/features/bookings/BookingDetailDrawer";
import { UnsavedChangesDialog } from "@/features/workspace/components/UnsavedChangesDialog";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
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
  const [propertyFilter, setPropertyFilter] = useState("all");
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
  }, [tenantId]);

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
    if (!tenantId || !catalogReady) return;

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
        propertyId: propertyFilter !== "all" ? propertyFilter : undefined,
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
    page,
    sortKey,
    sortDir,
    debouncedSearch,
    statusFilter,
    propertyFilter,
    unitFilter,
    arrivalFrom,
    arrivalTo,
    departureFrom,
    departureTo,
  ]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const workspaceUnitOptions = useMemo(
    () =>
      units.map((u) => ({
        unitId: u.id,
        unitName: u.name,
        propertyId: u.propertyId,
      })),
    [units],
  );
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const filteredUnits = useMemo(() => {
    if (propertyFilter === "all") return units;
    return units.filter((u) => u.propertyId === propertyFilter);
  }, [units, propertyFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading && !initialized) return <Skeleton className="h-[520px] w-full" />;
  if (error && !initialized) return <ErrorState message={error} onRetry={() => void loadBookings()} />;

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Reservation center — search, filter, and manage stays"
        actions={
          <Button asChild>
            <Link href="/dashboard/bookings/new">
              <Plus className="h-4 w-4" />
              Manual booking
            </Link>
          </Button>
        }
      />

      <StickyToolbar>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search guest, email, booking ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
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

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
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
            <Select value={propertyFilter} onValueChange={(v) => { setPropertyFilter(v); setUnitFilter("all"); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Property" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All units</SelectItem>
                {filteredUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={arrivalFrom} onChange={(e) => { setArrivalFrom(e.target.value); setPage(1); }} aria-label="Arrival from" />
            <Input type="date" value={arrivalTo} onChange={(e) => { setArrivalTo(e.target.value); setPage(1); }} aria-label="Arrival to" />
            <Input type="date" value={departureFrom} onChange={(e) => { setDepartureFrom(e.target.value); setPage(1); }} aria-label="Departure from" />
            <Input type="date" value={departureTo} onChange={(e) => { setDepartureTo(e.target.value); setPage(1); }} aria-label="Departure to" />
          </div>
        </div>
      </StickyToolbar>

      {error && initialized && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={() => void loadBookings()} />
        </div>
      )}

      {bookings.length === 0 && !loading ? (
        <EmptyState title="No bookings match" description="Adjust filters or wait for storefront reservations." />
      ) : (
        <div className={`rounded-md border bg-card ${loading && initialized ? "opacity-60" : ""}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("guest")}>
                  Guest <SortIcon column="guest" />
                </TableHead>
                <TableHead>Property / Unit</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("checkIn")}>
                  Arrival <SortIcon column="checkIn" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("checkOut")}>
                  Departure <SortIcon column="checkOut" />
                </TableHead>
                <TableHead>Guests</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("status")}>
                  Status <SortIcon column="status" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => {
                const unit = unitMap.get(booking.unitId);
                const property = propertyMap.get(booking.propertyId);
                return (
                  <TableRow
                    key={booking.id}
                    className="cursor-pointer"
                    onClick={() => requestClose(() => setSelected(booking))}
                  >
                    <TableCell>
                      <div className="font-medium">{booking.guest.name}</div>
                      <div className="text-xs text-muted-foreground">{booking.guest.email}</div>
                    </TableCell>
                    <TableCell>
                      <div>{property?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{unit?.name ?? "—"}</div>
                    </TableCell>
                    <TableCell>{booking.checkIn}</TableCell>
                    <TableCell>{booking.checkOut}</TableCell>
                    <TableCell>{booking.guestCount}</TableCell>
                    <TableCell><StatusBadge status={booking.status} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t p-4">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}

      <BookingDetailDrawer
        booking={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            requestClose(() => setSelected(null));
          }
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
