"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { fetchCleaningTemplate, saveCleaningTemplate } from "@/lib/admin/api";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toastSuccess } from "@/lib/admin/toast";

const MAX_ITEMS = 60;

type DraftItem = {
  id: string | null;
  label: string;
  description: string;
  required: boolean;
  photoRequired: boolean;
};

function emptyItem(): DraftItem {
  return {
    id: null,
    label: "",
    description: "",
    required: true,
    photoRequired: false,
  };
}

/**
 * Checklist authoring for the Active Property. One active template per
 * property; saving bumps its version, and running cleanings keep the snapshot
 * they started with.
 */
export function CleaningChecklistEditor() {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties: activeProperties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const [name, setName] = useState("Τυπική αναχώρηση");
  const [minimumCompletionPhotos, setMinimumCompletionPhotos] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    try {
      const template = await fetchCleaningTemplate(tenantId, propertyId);
      if (template) {
        setName(template.name);
        setMinimumCompletionPhotos(template.minimumCompletionPhotos);
        setVersion(template.version);
        setItems(
          template.items.map((item) => ({
            id: item.id,
            label: item.label,
            description: item.description ?? "",
            required: item.required,
            photoRequired: item.photoRequired,
          })),
        );
      } else {
        setVersion(null);
        setItems([emptyItem()]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης λίστας ελέγχου");
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function moveItem(index: number, delta: number) {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }

  async function handleSave() {
    if (!tenantId || !propertyId || saving) return;
    const payload = items
      .map((item) => ({
        id: item.id,
        label: item.label.trim(),
        description: item.description.trim() || null,
        required: item.required,
        photoRequired: item.photoRequired,
      }))
      .filter((item) => item.label.length > 0);

    if (payload.length === 0) {
      toastError("Προσθέστε τουλάχιστον ένα στοιχείο");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveCleaningTemplate(tenantId, {
        propertyId,
        name: name.trim(),
        minimumCompletionPhotos,
        items: payload,
      });
      setVersion(saved.version);
      toastSuccess("Η λίστα αποθηκεύτηκε");
      router.push("/dashboard/housekeeping");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης λίστας");
    } finally {
      setSaving(false);
    }
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
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Λίστα ελέγχου καθαρισμού"
        description={
          property
            ? `Λίστα για καθαρισμούς QR στο ${property.name}${
                version ? ` · v${version}` : ""
              }`
            : "Λίστα για καθαρισμούς QR"
        }
        actions={
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Αποθήκευση…" : "Αποθήκευση λίστας"}
          </Button>
        }
      />

      <Surface variant="panel">
        <SurfaceHeader
          title="Ρυθμίσεις"
          description="Ισχύει για κάθε καθαρισμό που ξεκινά από σάρωση QR σε αυτό το κατάλυμα."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="checklist-name">Όνομα λίστας</Label>
            <Input
              id="checklist-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="checklist-min-photos">Ελάχιστες φωτογραφίες για ολοκλήρωση</Label>
            <Input
              id="checklist-min-photos"
              type="number"
              min={0}
              max={50}
              value={minimumCompletionPhotos}
              onChange={(e) =>
                setMinimumCompletionPhotos(
                  Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                )
              }
            />
          </div>
        </div>
      </Surface>

      <Surface variant="panel">
        <SurfaceHeader
          title={`Items (${items.length}/${MAX_ITEMS})`}
          description="Τα υποχρεωτικά στοιχεία πρέπει να τσεκαριστούν και τα στοιχεία με φωτογραφία να έχουν τουλάχιστον μία, πριν την ολοκλήρωση."
        />
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={item.id ?? `new-${index}`} className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    value={item.label}
                    maxLength={255}
                    placeholder="π.χ. Αλλαγή σεντονιών σε όλα τα κρεβάτια"
                    onChange={(e) => updateItem(index, { label: e.target.value })}
                  />
                  <Input
                    value={item.description}
                    maxLength={2000}
                    placeholder="Προαιρετική καθοδήγηση"
                    onChange={(e) =>
                      updateItem(index, { description: e.target.value })
                    }
                  />
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.required}
                        onChange={(e) =>
                          updateItem(index, { required: e.target.checked })
                        }
                      />
                      Υποχρεωτικό
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.photoRequired}
                        onChange={(e) =>
                          updateItem(index, { photoRequired: e.target.checked })
                        }
                      />
                      Απαιτείται φωτογραφία
                    </label>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Μετακίνηση πάνω"
                    onClick={() => moveItem(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Μετακίνηση κάτω"
                    onClick={() => moveItem(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Αφαίρεση στοιχείου"
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={items.length >= MAX_ITEMS}
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
        >
          <Plus className="h-4 w-4" />
          Προσθήκη στοιχείου
        </Button>
      </Surface>
    </div>
  );
}
