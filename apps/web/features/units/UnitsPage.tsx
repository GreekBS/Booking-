"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MoreHorizontal, Plus, QrCode } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { adminFetch, fetchAllProperties, flattenUnits, invalidatePropertiesCache } from "@/lib/admin/api";
import type { FlatUnit, PropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
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
import { UnitQrSheet } from "@/features/cleaning/UnitQrSheet";

export function UnitsPage() {
  const searchParams = useSearchParams();
  const queryPropertyId = searchParams.get("propertyId");
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
    setActiveProperty,
  } = useActiveProperty();
  const syncedQueryRef = useRef<string | null>(null);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<FlatUnit | null>(null);
  const [archiveUnit, setArchiveUnit] = useState<FlatUnit | null>(null);
  const [detailUnit, setDetailUnit] = useState<FlatUnit | null>(null);
  const [qrUnit, setQrUnit] = useState<FlatUnit | null>(null);
  const [form, setForm] = useState({
    propertyId: "",
    name: "",
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    status: "active",
  });

  // Prefer Active Property as source of truth. If ?propertyId= is present and
  // accessible, sync once via setActiveProperty so the rest of the operator UI matches.
  useEffect(() => {
    if (!propertyReady || !queryPropertyId) return;
    if (syncedQueryRef.current === queryPropertyId) return;
    if (queryPropertyId === propertyId) {
      syncedQueryRef.current = queryPropertyId;
      return;
    }
    if (activeProperties.some((p) => p.id === queryPropertyId)) {
      setActiveProperty(queryPropertyId);
      syncedQueryRef.current = queryPropertyId;
    }
  }, [
    propertyReady,
    queryPropertyId,
    propertyId,
    activeProperties,
    setActiveProperty,
  ]);

  async function load() {
    if (!tenantId) return;
    const isFirstLoad = properties.length === 0;
    if (isFirstLoad) setLoading(true);
    try {
      const res = await fetchAllProperties(tenantId, 1, 100);
      setProperties(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης μονάδων");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  const units = useMemo(() => {
    const all = flattenUnits(properties);
    if (!propertyId) return [];
    return all.filter((u) => u.propertyId === propertyId);
  }, [properties, propertyId]);

  function openCreate() {
    if (!propertyId) return;
    setEditUnit(null);
    setForm({
      propertyId,
      name: "",
      maxGuests: 2,
      bedrooms: 1,
      bathrooms: 1,
      status: "active",
    });
    setDialogOpen(true);
  }

  function openΕπεξεργασία(unit: FlatUnit) {
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
        toastSuccess("Η μονάδα ενημερώθηκε");
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
        toastSuccess("Η μονάδα δημιουργήθηκε");
      }
      invalidatePropertiesCache(tenantId);
      setDialogOpen(false);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης μονάδας");
    }
  }

  async function archiveUnitAction(unit: FlatUnit) {
    if (!tenantId) return;
    await adminFetch(`/properties/${unit.propertyId}/units/${unit.id}`, {
      method: "DELETE",
      tenantId,
    });
    toastSuccess("Η μονάδα αρχειοθετήθηκε");
    setArchiveUnit(null);
    setDetailUnit(null);
    invalidatePropertiesCache(tenantId);
    await load();
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
  if (loading && properties.length === 0) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Μονάδες"
        description={
          property
            ? `Rooms for ${property.name} (Active Property)`
            : "Διαχείριση δωματίων και μονάδων διαμονής"
        }
        actions={
          <Button onClick={openCreate} disabled={!propertyId}>
            <Plus className="h-4 w-4" />
            Προσθήκη μονάδας
          </Button>
        }
      />

      {units.length === 0 ? (
        <EmptyState
          title="Δεν υπάρχουν μονάδες ακόμα"
          description="Προσθέστε μονάδες για διαχείσιμότητα και τιμές."
          action={{ label: "Προσθήκη μονάδας", onClick: openCreate }}
        />
      ) : (
        <Surface variant="panel" padding="none">
          <div className="border-b border-border px-4 py-3">
            <SurfaceHeader
              className="mb-0"
              title="Κατάλογος μονάδων"
              description={
                property
                  ? `${units.length} unit${units.length === 1 ? "" : "s"} · ${property.name}`
                  : undefined
              }
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Υπν. / Μπάν</TableHead>
                  <TableHead>Κατάσταση</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => setDetailUnit(unit)}
                      >
                        {unit.name}
                      </button>
                    </TableCell>
                    <TableCell>{unit.propertyName}</TableCell>
                    <TableCell>{unit.maxGuests} επισκέπτες</TableCell>
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
                          <DropdownMenuItem onClick={() => openΕπεξεργασία(unit)}>Επεξεργασία</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setQrUnit(unit)}>
                            QR καθαριότητας
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setArchiveUnit(unit)}>
                            Αρχειοθέτηση
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editUnit ? "Επεξεργασία μονάδας" : "Νέα μονάδα"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {!editUnit && property ? (
              <div className="space-y-2">
                <Label>Property</Label>
                <p className="text-sm font-medium">{property.name}</p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Όνομα</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Μέγ. επισκέπτες</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.maxGuests}
                  onChange={(e) => setForm({ ...form, maxGuests: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Υπνοδωμάτια</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.bedrooms}
                  onChange={(e) => setForm({ ...form, bedrooms: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Μπάνια</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.bathrooms}
                  onChange={(e) => setForm({ ...form, bathrooms: Number(e.target.value) })}
                />
              </div>
            </div>
            {editUnit ? (
              <div className="space-y-2">
                <Label>Κατάσταση</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ενεργό</SelectItem>
                    <SelectItem value="inactive">Ανενεργό</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Ακύρωση
            </Button>
            <Button onClick={() => void saveUnit()}>Αποθήκευση</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(detailUnit)} onOpenChange={(open) => !open && setDetailUnit(null)}>
        <SheetContent>
          {detailUnit ? (
            <>
              <SheetHeader>
                <SheetTitle>{detailUnit.name}</SheetTitle>
              </SheetHeader>
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Property</dt>
                  <dd>{detailUnit.propertyName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Slug</dt>
                  <dd className="font-mono text-xs">{detailUnit.slug}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Capacity</dt>
                  <dd>{detailUnit.maxGuests} επισκέπτες</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Υπνοδωμάτια</dt>
                  <dd>{detailUnit.bedrooms}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Μπάνια</dt>
                  <dd>{detailUnit.bathrooms}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Κατάσταση</dt>
                  <dd>
                    <StatusBadge status={detailUnit.status} />
                  </dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    openΕπεξεργασία(detailUnit);
                    setDetailUnit(null);
                  }}
                >
                  Επεξεργασία
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQrUnit(detailUnit);
                    setDetailUnit(null);
                  }}
                >
                  <QrCode className="h-4 w-4" />
                  QR καθαριότητας
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setArchiveUnit(detailUnit)}>
                  Αρχειοθέτηση
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {tenantId ? (
        <UnitQrSheet
          tenantId={tenantId}
          unit={qrUnit}
          onOpenChange={(open) => !open && setQrUnit(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveUnit)}
        onOpenChange={(open) => !open && setArchiveUnit(null)}
        title="Αρχειοθέτηση μονάδας"
        description={`Αρχειοθέτηση «${archiveUnit?.name}»; δεν θα δέχεται πλέον κρατήσεις.`}
        confirmLabel="Αρχειοθέτηση"
        destructive
        onConfirm={() => {
          if (archiveUnit) void archiveUnitAction(archiveUnit);
        }}
      />
    </div>
  );
}
