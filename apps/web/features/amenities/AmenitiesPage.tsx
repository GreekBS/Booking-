"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { adminFetch } from "@/lib/admin/api";
import type { AmenityRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export function AmenitiesPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [amenities, setAmenities] = useState<AmenityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "", category: "" });

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await adminFetch<{ data: AmenityRecord[] }>("/amenities", { tenantId });
      setAmenities(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amenities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function create() {
    if (!tenantId) return;
    await adminFetch("/amenities", {
      method: "POST",
      tenantId,
      body: JSON.stringify({
        name: form.name,
        icon: form.icon || null,
        category: form.category || null,
      }),
    });
    setDialogOpen(false);
    setForm({ name: "", icon: "", category: "" });
    await load();
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div>
      <PageHeader
        title="Amenities"
        description="Property features and tags — assign to properties from property details"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add amenity
          </Button>
        }
      />

      {amenities.length === 0 ? (
        <EmptyState
          title="No amenities"
          description="Create amenities and assign them to properties."
          action={{ label: "Add amenity", onClick: () => setDialogOpen(true) }}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Icon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {amenities.map((amenity) => (
                <TableRow key={amenity.id}>
                  <TableCell className="font-medium">{amenity.name}</TableCell>
                  <TableCell>{amenity.category ?? "—"}</TableCell>
                  <TableCell>{amenity.icon ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New amenity</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void create()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
