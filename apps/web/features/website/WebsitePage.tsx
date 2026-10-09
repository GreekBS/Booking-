"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Plus, RefreshCw } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ensureWebsite,
  formatWebsiteApiError,
  getWebsiteBundle,
  type WebsiteBundle,
} from "./website-api";
import { websiteStatusLabel, websiteThemeLabel } from "./theme-labels";

function sectionCount(sections: unknown): number {
  return Array.isArray(sections) ? sections.length : 0;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("el-GR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function WebsitePage() {
  const { tenantId, profile, loading: tenantLoading, error: tenantError } =
    useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const [bundle, setBundle] = useState<WebsiteBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const membership = useMemo(
    () => profile?.memberships.find((m) => m.tenantId === tenantId),
    [profile, tenantId],
  );
  const canEditWebsite =
    membership?.role === "admin" ||
    membership?.role === "manager" ||
    Boolean(profile?.user.platformRole);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    setError(null);
    setCreateError(null);
    try {
      const data = await getWebsiteBundle(tenantId, propertyId);
      setBundle(data);
    } catch (err) {
      setBundle(null);
      setError(formatWebsiteApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createWebsite() {
    if (!tenantId || !propertyId || !canEditWebsite || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await ensureWebsite(tenantId, propertyId);
      setBundle({
        website: created.website,
        draft: created.draft,
        published: null,
      });
    } catch (err) {
      setCreateError(formatWebsiteApiError(err));
      // Concurrent ensure may have succeeded — refresh authoritative state.
      await load();
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

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (propertyGate) return propertyGate;

  if (loading) {
    return (
      <div className="space-y-4" data-testid="website-loading">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="website-error">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const propertyLabel = property?.name ?? "αυτό το κατάλυμα";

  return (
    <div data-testid="website-page">
      <PageHeader
        title="Ιστότοπος"
        description="Διαχείριση του marketing ιστότοπου για το ενεργό κατάλυμα — πρόχειρο περιεχόμενο και θέμα."
        meta={
          <span className="text-xs text-muted-foreground">
            Ενεργό κατάλυμα ·{" "}
            <span className="font-medium text-foreground">{propertyLabel}</span>
          </span>
        }
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Ανανέωση
          </Button>
        }
      />

      {!bundle ? (
        <EmptyState
          title="Δεν υπάρχει ιστότοπος"
          description={`Δημιουργήστε έναν ιστότοπο για το «${propertyLabel}» ώστε να αποθηκεύσετε πρόχειρο περιεχόμενο και θέμα. Η δημοσίευση και τα θέματα έρχονται σε επόμενα βήματα.`}
          actions={
            canEditWebsite ? (
              <div className="flex flex-col items-center gap-2">
                {createError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {createError}
                  </p>
                ) : null}
                <Button
                  type="button"
                  onClick={() => void createWebsite()}
                  disabled={creating}
                  data-testid="website-create-button"
                >
                  <Plus className="h-4 w-4" />
                  {creating ? "Δημιουργία…" : "Δημιουργία ιστότοπου"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Δεν έχετε δικαίωμα δημιουργίας ιστότοπου για αυτό το κατάλυμα.
              </p>
            )
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Surface data-testid="website-overview-card">
            <SurfaceHeader
              title="Κατάσταση ιστότοπου"
              description="Στοιχεία από τον διακομιστή για το ενεργό κατάλυμα."
            />
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-muted-foreground">Κατάσταση</dt>
                <dd>
                  <StatusBadge
                    status={bundle.website.status}
                    label={websiteStatusLabel(bundle.website.status)}
                  />
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-muted-foreground">Θέμα</dt>
                <dd className="font-medium text-foreground">
                  {websiteThemeLabel(bundle.website.themeId)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({bundle.website.themeId})
                  </span>
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-muted-foreground">Έκδοση σχήματος</dt>
                <dd className="tabular-nums">
                  {bundle.website.contentSchemaVersion}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-muted-foreground">Τελευταία ενημέρωση</dt>
                <dd>{formatWhen(bundle.website.updatedAt)}</dd>
              </div>
            </dl>
            <p className="mt-4 flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Η επιλογή θέματος, ο επεξεργαστής περιεχομένου και η δημοσίευση θα
              προστεθούν σε επόμενες εκδόσεις. Δεν γίνεται προεπισκόπηση ή
              δημόσια απόδοση εδώ.
            </p>
          </Surface>

          <Surface data-testid="website-draft-card">
            <SurfaceHeader
              title="Πρόχειρη έκδοση"
              description="Σύνοψη του τρέχοντος draft — μόνο ανάγνωση."
            />
            {bundle.draft ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Έκδοση</dt>
                  <dd className="tabular-nums">
                    v{bundle.draft.versionNumber}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Κατάσταση</dt>
                  <dd>
                    <StatusBadge
                      status={bundle.draft.state}
                      label={websiteStatusLabel(bundle.draft.state)}
                    />
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Γλώσσα</dt>
                  <dd>{bundle.draft.locale}</dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Ενότητες</dt>
                  <dd className="tabular-nums">
                    {sectionCount(bundle.draft.sections)}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Δημιουργήθηκε</dt>
                  <dd>{formatWhen(bundle.draft.createdAt)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Δεν υπάρχει συνδεδεμένο πρόχειρο.
              </p>
            )}
          </Surface>

          <Surface className="lg:col-span-2" data-testid="website-published-card">
            <SurfaceHeader
              title="Δημοσιευμένη έκδοση"
              description="Αν υπάρχει δημοσιευμένο στιγμιότυπο, εμφανίζεται εδώ (χωρίς δημόσια διεύθυνση σε αυτό το βήμα)."
            />
            {bundle.published ? (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Έκδοση</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    v{bundle.published.versionNumber}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Κατάσταση</dt>
                  <dd className="mt-1">
                    <StatusBadge
                      status={bundle.published.state}
                      label={websiteStatusLabel(bundle.published.state)}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ενότητες</dt>
                  <dd className="mt-1 tabular-nums">
                    {sectionCount(bundle.published.sections)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Δημοσιεύτηκε</dt>
                  <dd className="mt-1">
                    {formatWhen(bundle.published.publishedAt)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Καμία δημοσίευση ακόμη. Ο δημόσιος ιστότοπος και τα DNS θα
                ενεργοποιηθούν σε επόμενο στάδιο.
              </p>
            )}
          </Surface>
        </div>
      )}
    </div>
  );
}
