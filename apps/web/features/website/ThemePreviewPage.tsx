"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SAMPLE_PROPERTY_DISPLAY_NAME,
  SAMPLE_WEBSITE_DRAFT_CONTENT,
  WebsitePreviewShell,
} from "@/features/website-themes";
import { getThemeGalleryEntry, isThemePreviewable } from "./theme-catalog";
import {
  draftBundleToRenderContent,
  draftHasRenderableSections,
  formatWebsiteApiError,
  getWebsiteBundle,
  type WebsiteBundle,
} from "./website-api";

export type ThemePreviewPageProps = {
  themeId: string;
};

type PreviewMode = "sample" | "draft";

function parseMode(raw: string | null): PreviewMode {
  return raw === "draft" ? "draft" : "sample";
}

export function ThemePreviewPage({ themeId }: ThemePreviewPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get("mode"));

  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const entry = getThemeGalleryEntry(themeId);
  const previewable = Boolean(entry && isThemePreviewable(themeId));

  const [bundle, setBundle] = useState<WebsiteBundle | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(mode === "draft");
  const [draftError, setDraftError] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    if (!tenantId || !propertyId || mode !== "draft") return;
    setLoadingDraft(true);
    setDraftError(null);
    try {
      const data = await getWebsiteBundle(tenantId, propertyId);
      setBundle(data);
    } catch (err) {
      setBundle(null);
      setDraftError(formatWebsiteApiError(err));
    } finally {
      setLoadingDraft(false);
    }
  }, [tenantId, propertyId, mode]);

  useEffect(() => {
    if (mode === "draft") {
      void loadDraft();
    } else {
      setBundle(null);
      setDraftError(null);
      setLoadingDraft(false);
    }
  }, [mode, loadDraft]);

  const draftContent = useMemo(() => {
    if (mode !== "draft" || !bundle?.website || !bundle.draft) return null;
    if (!draftHasRenderableSections(bundle.draft)) return null;
    return draftBundleToRenderContent(bundle.website, bundle.draft);
  }, [mode, bundle]);

  const setMode = (next: PreviewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", next);
    router.replace(
      `/dashboard/website/themes/${encodeURIComponent(themeId)}/preview?${params.toString()}`,
    );
  };

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

  if (!previewable || !entry) {
    return (
      <div data-testid="theme-preview-unavailable">
        <PageHeader
          title="Προεπισκόπηση μη διαθέσιμη"
          description="Αυτό το θέμα δεν είναι ακόμη διαθέσιμο για προεπισκόπηση."
          actions={
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/dashboard/website/themes">
                <ArrowLeft className="h-4 w-4" />
                Πίσω στα θέματα
              </Link>
            </Button>
          }
        />
        <EmptyState
          title="Coming soon"
          description="Μόνο ολοκληρωμένα θέματα μπορούν να προβληθούν. Το Luxury Villa είναι διαθέσιμο."
          action={{
            label: "Θέματα",
            href: "/dashboard/website/themes",
          }}
        />
      </div>
    );
  }

  const propertyLabel = property?.name ?? SAMPLE_PROPERTY_DISPLAY_NAME;

  return (
    <div data-testid="theme-preview-page" data-preview-mode={mode}>
      <PageHeader
        title={`Προεπισκόπηση · ${entry.label}`}
        description="Πραγματική απόδοση θέματος (όχι screenshot). Χωρίς δημοσίευση ή αλλαγές στη δημοσιευμένη έκδοση."
        meta={
          <span className="text-xs text-muted-foreground">
            Ενεργό κατάλυμα ·{" "}
            <span className="font-medium text-foreground">{propertyLabel}</span>
          </span>
        }
        actions={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/website/themes">
              <ArrowLeft className="h-4 w-4" />
              Κλείσιμο
            </Link>
          </Button>
        }
      />

      <div
        className="mb-4 inline-flex rounded-md border border-border bg-background p-0.5"
        role="group"
        aria-label="Πηγή περιεχομένου προεπισκόπησης"
        data-testid="theme-preview-mode-toggle"
      >
        <button
          type="button"
          className={
            mode === "sample"
              ? "rounded px-3 py-1.5 text-xs font-medium bg-muted text-foreground"
              : "rounded px-3 py-1.5 text-xs font-medium text-muted-foreground"
          }
          aria-pressed={mode === "sample"}
          data-testid="theme-preview-mode-sample"
          onClick={() => setMode("sample")}
        >
          Sample
        </button>
        <button
          type="button"
          className={
            mode === "draft"
              ? "rounded px-3 py-1.5 text-xs font-medium bg-muted text-foreground"
              : "rounded px-3 py-1.5 text-xs font-medium text-muted-foreground"
          }
          aria-pressed={mode === "draft"}
          data-testid="theme-preview-mode-draft"
          onClick={() => setMode("draft")}
        >
          My draft
        </button>
      </div>

      {mode === "sample" ? (
        <WebsitePreviewShell
          themeId={themeId}
          content={SAMPLE_WEBSITE_DRAFT_CONTENT}
          propertyDisplayName={SAMPLE_PROPERTY_DISPLAY_NAME}
          fullPage
        />
      ) : loadingDraft ? (
        <div className="space-y-3" data-testid="theme-preview-draft-loading">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : draftError ? (
        <div data-testid="theme-preview-draft-error">
          <ErrorState message={draftError} onRetry={() => void loadDraft()} />
        </div>
      ) : !bundle ? (
        <EmptyState
          title="Δεν υπάρχει ιστότοπος"
          description="Δημιουργήστε ιστότοπο για το ενεργό κατάλυμα ώστε να γίνει προεπισκόπηση του πρόχειρου περιεχομένου. Το sample preview παραμένει διαθέσιμο."
          actions={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode("sample")}
              >
                Sample preview
              </Button>
              <Button type="button" asChild>
                <Link href="/dashboard/website">Επισκόπηση ιστότοπου</Link>
              </Button>
            </div>
          }
        />
      ) : !draftContent ? (
        <EmptyState
          title="Κενό πρόχειρο"
          description="Το πρόχειρο δεν έχει ενότητες ακόμη. Δεν γίνεται ανάμειξη με demo περιεχόμενο — χρησιμοποιήστε Sample preview ή προσθέστε περιεχόμενο αργότερα."
          actions={
            <Button type="button" onClick={() => setMode("sample")}>
              Sample preview
            </Button>
          }
        />
      ) : (
        <WebsitePreviewShell
          themeId={themeId}
          content={{
            ...draftContent,
            themeId,
          }}
          propertyDisplayName={propertyLabel}
          fullPage
        />
      )}
    </div>
  );
}
