"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { Button } from "@/components/ui/button";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { elCommon } from "@/lib/i18n";
import { ReservationImportMapping } from "./ReservationImportMapping";
import { ReservationImportPreview } from "./ReservationImportPreview";
import { ReservationImportUpload } from "./ReservationImportUpload";
import { csvIssueMessageEl } from "./csv-issue-messages";
import {
  RESERVATION_IMPORT_CREATE_ERROR,
  RESERVATION_IMPORT_CREATE_SUCCESS,
} from "./reservation-import-copy";
import { useReservationImportWizard } from "./useReservationImportWizard";

/**
 * B3.2 CSV import workflow: select → inspect/map → preview → create draft → redirect.
 */
export function ReservationImportLandingPage() {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const wizard = useReservationImportWizard(tenantId);
  const createFocusRef = useRef<HTMLButtonElement>(null);
  const mappingHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (wizard.file && wizard.headerMapping) {
      mappingHeadingRef.current?.focus();
    }
  }, [wizard.file, wizard.headerMapping]);

  const gate = renderTenantGate({
    tenantId,
    loading: tenantLoading,
    error: tenantError,
  });
  if (gate) return gate;

  const handleCreate = async () => {
    if (!wizard.canCreate || wizard.creating) return;
    const outcome = await wizard.createDraft();
    if (!outcome.batchId) {
      toastError(outcome.error ?? RESERVATION_IMPORT_CREATE_ERROR);
      return;
    }
    if (outcome.warning) {
      toastError(outcome.warning);
    }
    toastSuccess(RESERVATION_IMPORT_CREATE_SUCCESS);
    router.push(
      `/dashboard/bookings/import/${encodeURIComponent(outcome.batchId)}`,
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Εισαγωγή κρατήσεων από CSV"
        description="Επιλέξτε αρχείο, αντιστοιχίστε στήλες και δημιουργήστε πρόχειρη εισαγωγή για έλεγχο πριν την τελική καταχώριση."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/bookings">{elCommon.back}</Link>
          </Button>
        }
      />

      <Surface variant="panel" padding="md" className="space-y-4">
        <SurfaceHeader
          title="1. Αρχείο CSV"
          description="Η πρόχειρη εισαγωγή δημιουργείται μόνο αφού ολοκληρώσετε αντιστοίχιση και πατήσετε δημιουργία."
        />
        <ReservationImportUpload
          file={wizard.file}
          disabled={wizard.creating}
          error={wizard.localError}
          maxBytes={wizard.limits.maxBytes}
          maxRows={wizard.limits.maxRows}
          onFileChange={(f) => void wizard.selectFile(f)}
        />
        {wizard.file &&
        !wizard.headerMapping &&
        wizard.fileOrMappingErrors.length > 0 ? (
          <ul
            className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
            role="alert"
          >
            {wizard.fileOrMappingErrors.slice(0, 8).map((issue, idx) => (
              <li key={`${issue.code}-${idx}`}>{csvIssueMessageEl(issue)}</li>
            ))}
          </ul>
        ) : null}
      </Surface>

      {wizard.file && wizard.headerMapping ? (
        <Surface variant="panel" padding="md" className="space-y-4">
          <SurfaceHeader
            title="2. Αντιστοίχιση στηλών"
            description="Επιβεβαιώστε ή διορθώστε την αντιστοίχιση των στηλών CSV στα πεδία TALOS."
          />
          <h3
            ref={mappingHeadingRef}
            tabIndex={-1}
            className="sr-only"
          >
            Αντιστοίχιση στηλών
          </h3>
          <ReservationImportMapping
            headerMapping={wizard.headerMapping}
            columnMapping={wizard.columnMapping}
            autoMappedSnapshot={wizard.autoMappedSnapshot}
            delimiter={wizard.delimiter}
            delimiterOverride={wizard.delimiterOverride}
            dateFormat={wizard.dateFormat}
            dateFormatRequired={wizard.dateFormatRequired}
            missingRequiredFields={wizard.missingRequiredFields}
            disabled={wizard.creating}
            onMap={wizard.updateColumnMapping}
            onDateFormatChange={wizard.updateDateFormat}
            onDelimiterChange={wizard.updateDelimiterOverride}
          />
        </Surface>
      ) : null}

      {wizard.file && wizard.parseResult && wizard.headerMapping ? (
        <Surface variant="panel" padding="md" className="space-y-4">
          <SurfaceHeader
            title="3. Προεπισκόπηση"
            description="Ελέγξτε έγκυρες γραμμές και σφάλματα πριν τη δημιουργία προχείρου."
          />
          <ReservationImportPreview
            parseResult={wizard.parseResult}
            structuralRowErrors={wizard.structuralRowErrors}
            fileOrMappingErrors={wizard.fileOrMappingErrors}
          />

          {wizard.createError ? (
            <p className="text-sm text-destructive" role="alert">
              {wizard.createError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {wizard.canCreate
                ? "Έτοιμο για δημιουργία πρόχειρης εισαγωγής."
                : "Διορθώστε τα σφάλματα αντιστοίχισης/δομής για να συνεχίσετε."}
            </p>
            <Button
              ref={createFocusRef}
              type="button"
              disabled={!wizard.canCreate || wizard.creating}
              onClick={() => void handleCreate()}
              aria-busy={wizard.creating || undefined}
            >
              {wizard.creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Δημιουργία…
                </>
              ) : (
                "Δημιουργία πρόχειρης εισαγωγής"
              )}
            </Button>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
