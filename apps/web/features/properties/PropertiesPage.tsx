"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { fetchAllProperties } from "@/lib/admin/api";
import type { PaginatedProperties, PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Pagination } from "@/components/admin/pagination";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 10;

export function PropertiesPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [data, setData] = useState<PaginatedProperties | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    setData(null);
    setLoading(true);
    setError(null);
    setPage(1);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      const isFirstLoad = data === null;
      if (isFirstLoad) setLoading(true);
      setError(null);
      try {
        const res = await fetchAllProperties(tenantId!, page, PAGE_SIZE);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load properties");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, page]);

  const filtered = useMemo(() => {
    const items = data?.data ?? [];
    return items.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.slug.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading && data === null) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Properties"
        description="Tenant-wide listings — search, open details, or jump to units. Not scoped to Active Property."
        actions={
          <Button asChild>
            <Link href="/dashboard/properties/new">
              <Plus className="h-4 w-4" />
              Add property
            </Link>
          </Button>
        }
      />

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title="Find properties"
          description="Filter by name, slug, or publication status."
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Surface>

      {filtered.length === 0 ? (
        <EmptyState
          title="No properties found"
          description="Create your first property to start accepting bookings."
          action={{ label: "Add property", href: "/dashboard/properties/new", onClick: () => {} }}
        />
      ) : (
        <Surface
          variant="panel"
          padding="none"
          className={loading && data !== null ? "opacity-60" : ""}
        >
          <div className="border-b border-border px-4 py-3">
            <SurfaceHeader
              className="mb-0"
              title="All properties"
              description={
                data
                  ? `${data.meta.total} total · page ${page} of ${totalPages}`
                  : undefined
              }
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((property: PropertyRecord) => (
                  <TableRow key={property.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/properties/${property.id}`}
                        className="font-medium hover:underline"
                      >
                        {property.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{property.slug}</TableCell>
                    <TableCell className="capitalize">{property.type}</TableCell>
                    <TableCell>
                      <StatusBadge status={property.status} />
                    </TableCell>
                    <TableCell>{property.units.length}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/properties/${property.id}`}>View details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/units?propertyId=${property.id}`}>
                              Manage units
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border p-4">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </Surface>
      )}
    </div>
  );
}
