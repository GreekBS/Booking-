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
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης παροχών");
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
      toastSuccess("Η παροχή δημιουργήθηκε");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία δημιουργίας παροχής");
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
        title="Παροχές"
        description="Κατάλογος παροχών σε επίπεδο οργανισμού. Αναθέστε παροχές σε κατάλυμα από τη σελίδα λεπτομερειών — δεν χρησιμοποιεί το ενεργό κατάλυμα."
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
            Προσθήκη παροχής
          </Button>
        }
      />

      <Surface padding="none">
        <div className="border-b border-border px-4 py-3">
          <SurfaceHeader
            className="mb-0"
            title="Κατάλογος παροχών"
            description="Κοινός ορισμός για τον οργανισμό. Η ανάθεση γίνεται στη σελίδα λεπτομερειών κάθε καταλύματος."
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
              title="Δεν υπάρχουν παροχές ακόμα"
              description="Δημιουργήστε εγγραφές εδώ και μετά αναθέστε τις στη σελίδα λεπτομερειών καταλύματος."
              action={{
                label: "Προσθήκη παροχής",
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
                <TableHead>Όνομα</TableHead>
                <TableHead>Κατηγορία</TableHead>
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
            <DialogTitle>Νέα παροχή</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="amenity-name">Όνομα</Label>
              <Input
                id="amenity-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amenity-category">Κατηγορία</Label>
              <Input
                id="amenity-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Προαιρετικό"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amenity-icon">Icon</Label>
              <Input
                id="amenity-icon"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="Προαιρετικό κλειδί ή όνομα"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Ακύρωση
            </Button>
            <Button
              disabled={creating || !form.name.trim()}
              onClick={() => void create()}
            >
              {creating ? "Δημιουργία…" : "Δημιουργία"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
