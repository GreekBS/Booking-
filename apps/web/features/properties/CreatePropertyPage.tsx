"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { adminFetch, invalidatePropertiesCache } from "@/lib/admin/api";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { elCommon } from "@/lib/i18n";

export function CreatePropertyPage() {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [name, setName] = useState("");
  const [type, setType] = useState("villa");
  const [maxGuests, setMaxGuests] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      await adminFetch("/properties", {
        method: "POST",
        tenantId,
        body: JSON.stringify({ name, type, maxGuests }),
      });
      invalidatePropertiesCache(tenantId);
      router.push("/dashboard/properties");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία δημιουργίας καταλύματος");
    } finally {
      setLoading(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Νέο κατάλυμα"
        description="Δημιουργία καταχώρησης για τον οργανισμό. Δημιουργείται προεπιλεγμένη μονάδα με την παρακάτω χωρητικότητα."
      />

      <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-4">
        {error ? <ErrorState message={error} /> : null}

        <Surface variant="panel" padding="md">
          <SurfaceHeader
            title="Βασικά καταχώρησης"
            description="Όνομα και τύπος στο πάνελ χειριστή και στο storefront."
          />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Όνομα</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Τύπος</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="villa">Villa</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Surface>

        <Surface variant="panel" padding="md">
          <SurfaceHeader
            title="Προεπιλεγμένη μονάδα"
            description="Αρχική χωρητικότητα. Μπορείτε να προσθέσετε μονάδες μετά τη δημιουργία."
          />
          <div className="space-y-2">
            <Label htmlFor="maxGuests">Μέγ. επισκέπτες</Label>
            <Input
              id="maxGuests"
              type="number"
              min={1}
              value={maxGuests}
              onChange={(e) => setMaxGuests(Number(e.target.value))}
            />
          </div>
        </Surface>

        <Button type="submit" disabled={loading}>
          {loading ? `${elCommon.create}…` : elCommon.createProperty}
        </Button>
      </form>
    </div>
  );
}
