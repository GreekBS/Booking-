"use client";

import { useEffect, useMemo, useState } from "react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { fetchAllBookings } from "@/lib/admin/api";
import type { BookingRecord, GuestRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
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
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      setLoading(true);
      try {
        const bookings = await fetchAllBookings(tenantId!);
        setGuests(aggregateGuests(bookings));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load guests");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [tenantId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return guests;
    return guests.filter(
      (g) => g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q),
    );
  }, [guests, search]);

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="Guests"
        description="Guest profiles derived from booking history"
      />

      <div className="mb-4">
        <Input placeholder="Search guests..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No guests yet" description="Guests appear after their first booking." />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Last stay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((guest) => (
                <TableRow key={guest.email}>
                  <TableCell className="font-medium">{guest.name}</TableCell>
                  <TableCell>{guest.email}</TableCell>
                  <TableCell>{guest.phone ?? "—"}</TableCell>
                  <TableCell>{guest.bookingCount}</TableCell>
                  <TableCell>{guest.lastStayCheckOut ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
