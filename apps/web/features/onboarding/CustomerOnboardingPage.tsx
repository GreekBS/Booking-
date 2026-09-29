"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { adminFetch } from "@/lib/admin/api";
import { useTenant } from "@/hooks/use-tenant";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * First-time customer path when the signed-in user has no tenant membership.
 * Creates organization → admin membership → sets JWT active tenant → dashboard.
 */
export function CustomerOnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const { refresh, profile } = useTenant();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const created = await adminFetch<{
        id: string;
        activeTenantId: string;
        reusedExisting?: boolean;
      }>("/organization", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          timezone: "Europe/Athens",
          defaultLocale: "el",
          defaultCurrency: "EUR",
        }),
      });

      // JWT strategy: Auth.js update() establishes activeTenantId (same as Open Tenant).
      await update({ activeTenantId: created.activeTenantId });
      await refresh();
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Δεν ήταν δυνατή η δημιουργία του οργανισμού. Δοκιμάστε ξανά.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Καλώς ήρθατε στο Talos"
        description="Δημιουργήστε τον οργανισμό σας για να προσθέσετε κατάλυμα, τιμές και κρατήσεις."
      />

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title="Οργανισμός"
          description={
            profile?.user?.email
              ? `Συνδεδεμένοι ως ${profile.user.email}. Θα γίνετε διαχειριστής του οργανισμού.`
              : "Θα γίνετε διαχειριστής του οργανισμού."
          }
        />
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error ? <ErrorState message={error} /> : null}
          <div className="space-y-2">
            <Label htmlFor="org-name">Όνομα οργανισμού / επιχείρησης</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="π.χ. Aegean Villas"
              required
              minLength={2}
              autoFocus
            />
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Δημιουργία οργανισμού</li>
            <li>Προσθήκη πρώτου καταλύματος</li>
            <li>Ορισμός τιμών και ενεργοποίηση</li>
            <li>Πρώτη κράτηση</li>
          </ol>
          <Button type="submit" disabled={loading || name.trim().length < 2} className="w-full">
            {loading ? "Δημιουργία…" : "Δημιουργία οργανισμού"}
          </Button>
        </form>
      </Surface>
    </div>
  );
}
