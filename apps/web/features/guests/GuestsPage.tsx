"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { mapGuestDirectoryRow, searchGuests } from "@/lib/admin/api";
import type { GuestRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { Pagination } from "@/components/admin/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

function formatContact(email: string | null, phone: string | null): string {
  const parts = [email, phone].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function GuestsPage() {
  const { tenantId, profile, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [entireTenant, setEntireTenant] = useState(false);

  const membership = profile?.memberships.find((m) => m.tenantId === tenantId);
  const canEntireTenant =
    membership?.role === "admin" || Boolean(profile?.user.platformRole);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, entireTenant, propertyId]);

  useEffect(() => {
    if (!tenantId) return;
    if (!entireTenant && !propertyId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await searchGuests(tenantId!, {
          propertyId: propertyId ?? undefined,
          entireTenant: entireTenant && canEntireTenant,
          search: debouncedSearch || undefined,
          page,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        setGuests(result.data.map(mapGuestDirectoryRow));
        setTotal(result.total);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load guests");
          setGuests([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, propertyId, entireTenant, canEntireTenant, debouncedSearch, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = Boolean(debouncedSearch) || entireTenant;

  const scopeLabel =
    entireTenant && canEntireTenant
      ? "Entire tenant"
      : property?.name
        ? `Active property · ${property.name}`
        : "Active property";

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (!entireTenant && propertyGate) return propertyGate;
  if (tenantLoading || (!entireTenant && !propertyReady)) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (tenantError) return <ErrorState message={tenantError} />;
  if (!tenantId) {
    return <ErrorState title="No tenant context" message="Select a tenant to view guests." />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Guests"
        description="CRM guest directory with stay metrics from reservations you can see."
        meta={
          <span className="text-xs text-muted-foreground">
            {scopeLabel}
            {" · "}
            <Link
              href="/dashboard/bookings/new"
              className="text-primary underline-offset-2 hover:underline"
            >
              New reservation
            </Link>
          </span>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          className="max-w-md"
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search guests"
        />
        {canEntireTenant ? (
          <Button
            type="button"
            variant={entireTenant ? "secondary" : "outline"}
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            onClick={() => setEntireTenant((v) => !v)}
            aria-pressed={entireTenant}
          >
            {entireTenant ? "Entire tenant" : "Active property only"}
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <Surface padding="none">
          <div className="border-b border-border px-4 py-3">
            <SurfaceHeader
              className="mb-0"
              title="Guest directory"
              description={
                entireTenant && canEntireTenant
                  ? "All guests with reservation activity across the tenant."
                  : "Guests with reservation activity at the active property."
              }
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
                title={filtersActive ? "No matching guests" : "No guests yet"}
                description={
                  filtersActive
                    ? "Try a different search or scope."
                    : "Guests appear after linked reservations. Create a booking or import channel reservations."
                }
                action={
                  filtersActive
                    ? undefined
                    : {
                        label: "New reservation",
                        href: "/dashboard/bookings/new",
                      }
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead className="hidden sm:table-cell">Contact</TableHead>
                    <TableHead className="text-right">Stays</TableHead>
                    <TableHead className="hidden md:table-cell">Last stay</TableHead>
                    <TableHead className="hidden lg:table-cell">Next stay</TableHead>
                    <TableHead className="hidden md:table-cell">Tags</TableHead>
                    <TableHead className="w-[72px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guests.map((guest) => (
                    <TableRow key={guest.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/guests/${guest.id}`}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {guest.displayName}
                        </Link>
                        <div className="text-xs text-muted-foreground sm:hidden">
                          {formatContact(guest.email, guest.phone)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[220px] truncate text-muted-foreground sm:table-cell">
                        {formatContact(guest.email, guest.phone)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{guest.stayCount}</TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                        {guest.lastStayCheckOut ?? "—"}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                        {guest.nextStayCheckIn ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex max-w-[160px] flex-wrap gap-1">
                          {guest.tags.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            guest.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag.id} variant="secondary" className="text-[10px]">
                                {tag.name}
                              </Badge>
                            ))
                          )}
                          {guest.tags.length > 3 ? (
                            <span className="text-[10px] text-muted-foreground">
                              +{guest.tags.length - 3}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
                          <Link href={`/dashboard/guests/${guest.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className={cn("border-t border-border px-4 py-3")}>
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </Surface>
      </div>
    </div>
  );
}
