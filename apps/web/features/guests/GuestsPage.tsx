"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { fetchAllBookings } from "@/lib/admin/api";
import type { BookingRecord, GuestRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function aggregateGuests(bookings: BookingRecord[]): GuestRecord[] {
  const map = new Map<string, GuestRecord>();
  for (const booking of bookings) {
    const key = booking.guest.email.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        email: booking.guest.email,
        name: booking.guest.name,
        phone: booking.guest.phone,
        bookingCount: 1,
        lastStayCheckOut: booking.checkOut,
      });
    } else {
      existing.bookingCount += 1;
      if (booking.checkOut > (existing.lastStayCheckOut ?? "")) {
        existing.lastStayCheckOut = booking.checkOut;
        existing.name = booking.guest.name;
        existing.phone = booking.guest.phone;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.bookingCount - a.bookingCount);
}

export function GuestsPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!tenantId || !propertyId) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const bookings = await fetchAllBookings(tenantId!, { propertyId: propertyId! });
        setGuests(aggregateGuests(bookings));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load guests");
        setGuests([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [tenantId, propertyId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return guests;
    return guests.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        (g.phone ?? "").toLowerCase().includes(q),
    );
  }, [guests, search]);

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (propertyGate) return propertyGate;

  return (
    <div>
      <PageHeader
        title="Guests"
        description="Directory built from reservation history for the active property — not a CRM. Contact details and stay counts come from bookings."
        meta={
          property?.name ? (
            <span className="text-xs text-muted-foreground">
              Active property ·{" "}
              <span className="font-medium text-foreground">{property.name}</span>
              {" · "}
              <Link
                href="/dashboard/bookings"
                className="text-primary underline-offset-2 hover:underline"
              >
                Open bookings
              </Link>
              <span>
                {" "}
                — search by guest email there to find stays
              </span>
            </span>
          ) : null
        }
      />

      <div className="mb-4">
        <Input
          placeholder="Filter by name, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter guests"
        />
      </div>

      <Surface padding="none">
        <div className="border-b border-border px-4 py-3">
          <SurfaceHeader
            className="mb-0"
            title="Guest directory"
            description="Unique guests aggregated by email from bookings on this property."
          />
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState message={error} />
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : guests.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              title="No guests yet"
              description="Guests appear here after their first booking on this property. Create or import bookings to build the directory."
              action={{
                label: "View bookings",
                href: "/dashboard/bookings",
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              title="No matching guests"
              description="Try a different name or email, or clear the filter."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="hidden md:table-cell">Last stay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((guest) => (
                <TableRow key={guest.email}>
                  <TableCell className="font-medium">{guest.name}</TableCell>
                  <TableCell className="max-w-[160px] truncate sm:max-w-none">
                    <Link
                      href="/dashboard/bookings"
                      className="text-primary underline-offset-2 hover:underline"
                      title={`Open bookings and search for ${guest.email}`}
                    >
                      {guest.email}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {guest.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {guest.bookingCount}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                    {guest.lastStayCheckOut ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Surface>
    </div>
  );
}
