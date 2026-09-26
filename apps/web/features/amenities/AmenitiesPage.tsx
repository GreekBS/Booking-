"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { adminFetch } from "@/lib/admin/api";
import type { AmenityRecord } from "@/lib/admin/types";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
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
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "", category: "" });

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: AmenityRecord[] }>("/amenities", { tenantId });
      setAmenities(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amenities");
      setAmenities([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function create() {
    if (!tenantId || !form.name.trim()) return;
    setCreating(true);
    try {
      await adminFetch("/amenities", {
        method: "POST",
        tenantId,
        body: JSON.stringify({
          name: form.name.trim(),
          icon: form.icon.trim() || null,
          category: form.category.trim() || null,
        }),
      });
      setDialogOpen(false);
      setForm({ name: "", icon: "", category: "" });
      toastSuccess("Amenity created");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create amenity");
    } finally {
      setCreating(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;

  return (
    <div>
      <PageHeader
        title="Amenities"
        description="Tenant-wide catalog of amenity definitions. Assign amenities to a property from Property detail — this page does not use Active Property."
        meta={
          <span className="text-xs text-muted-foreground">
            Assign on{" "}
            <Link
              href="/dashboard/properties"
              className="text-primary underline-offset-2 hover:underline"
            >
              Properties
            </Link>
          </span>
        }
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add amenity
          </Button>
        }
      />

      <Surface padding="none">
        <div className="border-b border-border px-4 py-3">
          <SurfaceHeader
            className="mb-0"
            title="Amenity catalog"
            description="Shared definitions for the tenant. Property assignment happens on each property’s detail page."
          />
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={() => void load()} />
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : amenities.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              title="No amenities yet"
              description="Create catalog entries here, then assign them on a property’s detail page."
              action={{
                label: "Add amenity",
                onClick: () => setDialogOpen(true),
              }}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Or open{" "}
              <Link
                href="/dashboard/properties"
                className="text-primary underline-offset-2 hover:underline"
              >
                Properties
              </Link>{" "}
              to assign amenities after they exist.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden sm:table-cell">Icon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {amenities.map((amenity) => (
                <TableRow key={amenity.id}>
                  <TableCell className="font-medium">{amenity.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {amenity.category ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {amenity.icon ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Surface>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New amenity</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="amenity-name">Name</Label>
              <Input
                id="amenity-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amenity-category">Category</Label>
              <Input
                id="amenity-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amenity-icon">Icon</Label>
              <Input
                id="amenity-icon"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="Optional key or name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={creating || !form.name.trim()}
              onClick={() => void create()}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
