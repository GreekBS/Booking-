"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { resolveQrToken } from "@/lib/admin/api";
import type { ResolvedQrUnit } from "@/lib/admin/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/error-state";
import { CleaningForm } from "./CleaningForm";

/**
 * Landing surface for a scanned unit QR code.
 *
 * Reaching this component already implies an authenticated session — the
 * middleware bounces anonymous visitors to `/login?callbackUrl=/q/<token>`.
 * The token is then exchanged server-side for unit identity under the
 * operator's tenant and property ACL.
 */
export function QrLandingPage({ token }: { token: string }) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [resolved, setResolved] = useState<ResolvedQrUnit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const unit = await resolveQrToken(tenantId, token);
        if (!cancelled) setResolved(unit);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Αυτός ο κωδικός QR δεν αναγνωρίζεται",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, token]);

  if (tenantLoading) return <Skeleton className="m-4 h-64" />;
  if (tenantError) return <ErrorState message={tenantError} />;
  if (error) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <ErrorState message={error} />
        <p className="mt-3 text-sm text-muted-foreground">
          Ο κωδικός μπορεί να έχει αντικατασταθεί ή να ανήκει σε άλλο workspace.
          Ζητήστε από διαχειριστή να εκτυπώσει νέο.
        </p>
      </div>
    );
  }
  if (!resolved) return <Skeleton className="m-4 h-64" />;

  return (
    <CleaningForm
      locationId={resolved.locationId}
      unitId={resolved.unitId ?? undefined}
      scannedFrom="Σαρωμένος κωδικός QR"
    />
  );
}
