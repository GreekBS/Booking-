"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { adminFetch, fetchAllProperties, flattenUnits, invalidatePropertiesCache } from "@/lib/admin/api";
import type { FlatUnit, PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function UnitsPage() {
  const searchParams = useSearchParams();
  const initialPropertyId = searchParams.get("propertyId") ?? "all";
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState(initialPropertyId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<FlatUnit | null>(null);
  const [archiveUnit, setArchiveUnit] = useState<FlatUnit | null>(null);
  const [detailUnit, setDetailUnit] = useState<FlatUnit | null>(null);
  const [form, setForm] = useState({
    propertyId: "",
    name: "",
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    status: "active",
  });

  async function load() {
    if (!tenantId) return;
    const isFirstLoad = properties.length === 0;
    if (isFirstLoad) setLoading(true);
    try {
      const res = await fetchAllProperties(tenantId, 1, 100);
      setProperties(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load units");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  const units = useMemo(() => {
    const all = flattenUnits(properties);
    if (propertyFilter === "all") return all;
    return all.filter((u) => u.propertyId === propertyFilter);
  }, [properties, propertyFilter]);

  function openCreate() {
    setEditUnit(null);
    setForm({
      propertyId: propertyFilter !== "all" ? propertyFilter : properties[0]?.id ?? "",
      name: "",
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      status: "active",
    });
    setDialogOpen(true);
  }

  function openEdit(unit: FlatUnit) {
    setEditUnit(unit);
    setForm({
      propertyId: unit.propertyId,
      name: unit.name,
      maxGuests: unit.maxGuests,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      status: unit.status,
    });
    setDialogOpen(true);
  }

  async function saveUnit() {
    if (!tenantId || !form.propertyId) return;
    try {
      if (editUnit) {
        await adminFetch(`/properties/${form.propertyId}/units/${editUnit.id}`, {
          method: "PATCH",
          tenantId,
          body: JSON.stringify({
            name: form.name,
            maxGuests: form.maxGuests,
            bedrooms: form.bedrooms,
            bathrooms: form.bathrooms,
            status: form.status,
          }),
        });
        toastSuccess("Unit updated");
      } else {
        await adminFetch(`/properties/${form.propertyId}/units`, {
          method: "POST",
          tenantId,
          body: JSON.stringify({
            name: form.name,
            maxGuests: form.maxGuests,
            bedrooms: form.bedrooms,
            bathrooms: form.bathrooms,
          }),
        });
        toastSuccess("Unit created");
      }
      invalidatePropertiesCache(tenantId);
      setDialogOpen(false);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to save unit");
    }
  }

  async function archiveUnitAction(unit: FlatUnit) {
    if (!tenantId) return;
    await adminFetch(`/properties/${unit.propertyId}/units/${unit.id}`, {
      method: "DELETE",
      tenantId,
    });
    toastSuccess("Unit archived");
    setArchiveUnit(null);
    setDetailUnit(null);
    invalidatePropertiesCache(tenantId);
    await load();
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading && properties.length === 0) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div>
      <PageHeader
        title="Units"
        description="Manage rooms and accommodation units"
        actions={
          <Button onClick={openCreate} disabled={properties.length === 0}>
            <Plus className="h-4 w-4" />
            Add unit
          </Button>
        }
      />

      <div className="mb-4">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-full sm:w-[240px]">
            <SelectValue placeholder="Filter by property" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {units.length === 0 ? (
        <EmptyState
          title="No units yet"
          description="Add units to your properties to manage availability and pricing."
          action={{ label: "Add unit", onClick: openCreate }}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Bed / Bath</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="font-medium">
                    <button type="button" className="hover:underline" onClick={() => setDetailUnit(unit)}>
                      {unit.name}
                    </button>
                  </TableCell>
                  <TableCell>{unit.propertyName}</TableCell>
                  <TableCell>{unit.maxGuests} guests</TableCell>
                  <TableCell>
                    {unit.bedrooms} / {unit.bathrooms}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={unit.status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(unit)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setArchiveUnit(unit)}>Archive</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editUnit ? "Edit unit" : "New unit"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {!editUnit && (
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={form.propertyId} onValueChange={(v) => setForm({ ...form, propertyId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Max guests</Label>
                <Input type="number" min={1} value={form.maxGuests} onChange={(e) => setForm({ ...form, maxGuests: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Bedrooms</Label>
                <Input type="number" min={0} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Bathrooms</Label>
                <Input type="number" min={0} value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: Number(e.target.value) })} />
              </div>
            </div>
            {editUnit && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveUnit()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(detailUnit)} onOpenChange={(open) => !open && setDetailUnit(null)}>
        <SheetContent>
          {detailUnit && (
            <>
              <SheetHeader>
                <SheetTitle>{detailUnit.name}</SheetTitle>
              </SheetHeader>
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Property</dt><dd>{detailUnit.propertyName}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Slug</dt><dd className="font-mono text-xs">{detailUnit.slug}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Capacity</dt><dd>{detailUnit.maxGuests} guests</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Bedrooms</dt><dd>{detailUnit.bedrooms}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Bathrooms</dt><dd>{detailUnit.bathrooms}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={detailUnit.status} /></dd></div>
              </dl>
              <div className="mt-6 flex gap-2">
                <Button size="sm" onClick={() => { openEdit(detailUnit); setDetailUnit(null); }}>Edit</Button>
                <Button size="sm" variant="destructive" onClick={() => setArchiveUnit(detailUnit)}>Archive</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(archiveUnit)}
        onOpenChange={(open) => !open && setArchiveUnit(null)}
        title="Archive unit"
        description={`Archive "${archiveUnit?.name}"? It will no longer accept bookings.`}
        confirmLabel="Archive"
        destructive
        onConfirm={() => { if (archiveUnit) void archiveUnitAction(archiveUnit); }}
      />
    </div>
  );
}
