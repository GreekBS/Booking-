"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Eye, Sparkles } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { PageHeader } from "@/components/admin/page-header";
import { Surface } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  THEME_GALLERY_ENTRIES,
  isThemePreviewable,
  isThemeSelectable,
  type ThemeGalleryEntry,
} from "./theme-catalog";
import {
  formatWebsiteApiError,
  getWebsiteBundle,
  updateWebsiteTheme,
  type WebsiteBundle,
} from "./website-api";
import { websiteThemeLabel } from "./theme-labels";

export function ThemeGalleryPage() {
  const router = useRouter();
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
  const [pendingTheme, setPendingTheme] = useState<ThemeGalleryEntry | null>(
    null,
  );
  const [selecting, setSelecting] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);

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

  async function confirmSelectTheme() {
    if (
      !pendingTheme ||
      !tenantId ||
      !propertyId ||
      !canEditWebsite ||
      !bundle ||
      selecting
    ) {
      return;
    }
    if (!isThemeSelectable(pendingTheme.id)) return;

    setSelecting(true);
    setSelectError(null);
    const publishedBefore = bundle.published;
    try {
      const res = await updateWebsiteTheme(
        tenantId,
        propertyId,
        pendingTheme.id,
      );
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              website: res.website,
              // Selection must not invent or alter published snapshots.
              published: prev.published ?? publishedBefore,
            }
          : {
              website: res.website,
              draft: null,
              published: null,
            },
      );
      setPendingTheme(null);
      await load();
    } catch (err) {
      setSelectError(formatWebsiteApiError(err));
      setPendingTheme(null);
    } finally {
      setSelecting(false);
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
      <div className="space-y-4" data-testid="theme-gallery-loading">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="theme-gallery-error">
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const propertyLabel = property?.name ?? "αυτό το κατάλυμα";
  const selectedThemeId = bundle?.website.themeId ?? "unset";
  const websiteExists = Boolean(bundle);

  return (
    <div data-testid="theme-gallery-page">
      <PageHeader
        title="Θέματα ιστότοπου"
        description="Περιηγηθείτε σε επαγγελματικά θέματα φιλοξενίας. Προεπισκόπηση και επιλογή είναι διαθέσιμες μόνο για ολοκληρωμένα θέματα."
        meta={
          <span className="text-xs text-muted-foreground">
            Ενεργό κατάλυμα ·{" "}
            <span className="font-medium text-foreground">{propertyLabel}</span>
            {" · "}
            Θέμα:{" "}
            <span className="font-medium text-foreground">
              {websiteThemeLabel(selectedThemeId)}
            </span>
          </span>
        }
        actions={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/website">
              <ArrowLeft className="h-4 w-4" />
              Επισκόπηση
            </Link>
          </Button>
        }
      />

      {!websiteExists ? (
        <Surface className="mb-4" data-testid="theme-gallery-no-website">
          <p className="text-sm text-muted-foreground">
            Δεν υπάρχει ακόμη ιστότοπος για αυτό το κατάλυμα. Δημιουργήστε έναν
            από την επισκόπηση για να επιλέξετε θέμα. Μπορείτε να δείτε demo
            προεπισκόπηση του Luxury Villa χωρίς επιλογή.
          </p>
          <Button type="button" className="mt-3" asChild>
            <Link href="/dashboard/website">Μετάβαση στην επισκόπηση</Link>
          </Button>
        </Surface>
      ) : null}

      {selectError ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {selectError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {THEME_GALLERY_ENTRIES.map((entry) => {
          const ready = entry.status === "ready";
          const selected = selectedThemeId === entry.id;
          const previewHref = `/dashboard/website/themes/${entry.id}/preview?mode=sample`;

          return (
            <Surface
              key={entry.id}
              className="flex flex-col overflow-hidden p-0"
              data-testid={`theme-card-${entry.id}`}
              data-theme-status={entry.status}
            >
              <div className="relative aspect-[16/10] bg-muted">
                <img
                  src={entry.thumbnailSrc}
                  alt={`Demo thumbnail for ${entry.label}`}
                  className={`h-full w-full object-cover ${ready ? "" : "opacity-60 grayscale"}`}
                />
                <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                  {ready ? (
                    <StatusBadge status="active" label="Διαθέσιμο" />
                  ) : (
                    <StatusBadge status="pending" label="Σύντομα" />
                  )}
                  {selected ? (
                    <StatusBadge status="confirmed" label="Επιλεγμένο" />
                  ) : null}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">
                    {entry.label}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {entry.blurb}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {isThemePreviewable(entry.id) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`theme-preview-${entry.id}`}
                      onClick={() => router.push(previewHref)}
                    >
                      <Eye className="h-4 w-4" />
                      Προεπισκόπηση
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled
                      data-testid={`theme-preview-disabled-${entry.id}`}
                    >
                      Προεπισκόπηση σύντομα
                    </Button>
                  )}
                  {ready ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !canEditWebsite ||
                        !websiteExists ||
                        selected ||
                        selecting
                      }
                      data-testid={`theme-select-${entry.id}`}
                      onClick={() => {
                        setSelectError(null);
                        setPendingTheme(entry);
                      }}
                    >
                      {selected ? (
                        <>
                          <Check className="h-4 w-4" />
                          Επιλεγμένο
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Επιλογή
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled
                      data-testid={`theme-select-disabled-${entry.id}`}
                    >
                      Μη διαθέσιμο
                    </Button>
                  )}
                </div>
                {ready && !websiteExists ? (
                  <p className="text-[11px] text-muted-foreground">
                    Απαιτείται δημιουργία ιστότοπου για επιλογή θέματος.
                  </p>
                ) : null}
                {ready && websiteExists && !canEditWebsite ? (
                  <p className="text-[11px] text-muted-foreground">
                    Δεν έχετε δικαίωμα αλλαγής θέματος.
                  </p>
                ) : null}
              </div>
            </Surface>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(pendingTheme)}
        onOpenChange={(open) => {
          if (!open && !selecting) setPendingTheme(null);
        }}
        title="Επιβεβαίωση θέματος"
        description={
          pendingTheme
            ? `Θέλετε να ορίσετε το θέμα «${pendingTheme.label}» για το «${propertyLabel}»; Η αλλαγή ενημερώνει μόνο την επιλογή θέματος του ιστότοπου — όχι τη δημοσιευμένη έκδοση.`
            : ""
        }
        confirmLabel="Επιλογή θέματος"
        loading={selecting}
        onConfirm={() => void confirmSelectTheme()}
      />
    </div>
  );
}
