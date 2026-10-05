"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { Button } from "@/components/ui/button";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { useTenant } from "@/hooks/use-tenant";
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
 * B3.2 / C4 CSV import workflow: active-property scoped select → inspect/map → preview → create draft.
 */
export function ReservationImportLandingPage() {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const bookableUnitCount = useMemo(() => {
    if (!property) return 0;
    return (property.units ?? []).filter((u) => u.status === "active").length;
  }, [property]);

  const wizard = useReservationImportWizard(
    tenantId,
    propertyId,
    bookableUnitCount,
  );
  const createFocusRef = useRef<HTMLButtonElement>(null);
  const mappingHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (wizard.file && wizard.headerMapping) {
      mappingHeadingRef.current?.focus();
    }
  }, [wizard.file, wizard.headerMapping]);

  const gate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
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

      {property ? (
        <p className="text-sm text-muted-foreground" data-testid="import-active-property">
          Ενεργό κατάλυμα:{" "}
          <span className="font-medium text-foreground">{property.name}</span>
          {bookableUnitCount === 1
            ? " · μία μονάδα (unitRef προαιρετικό)"
            : bookableUnitCount > 1
              ? ` · ${bookableUnitCount} μονάδες (unitRef υποχρεωτικό)`
              : " · χωρίς ενεργές μονάδες"}
        </p>
      ) : null}

      <Surface variant="panel" padding="md" className="space-y-4">
        <SurfaceHeader
          title="1. Αρχείο CSV"
          description="Η πρόχειρη εισαγωγή δημιουργείται μόνο αφού ολοκληρώσετε αντιστοίχιση και πατήσετε δημιουργία."
        />
        <ReservationImportUpload
          file={wizard.file}
          error={wizard.localError}
          maxBytes={wizard.limits.maxBytes}
          maxRows={wizard.limits.maxRows}
          onFileChange={(f) => void wizard.selectFile(f)}
        />
      </Surface>

      {wizard.file && wizard.headerMapping ? (
        <Surface variant="panel" padding="md" className="space-y-4">
          <SurfaceHeader
            title="2. Αντιστοίχιση στηλών"
            description="Επιβεβαιώστε ή διορθώστε την αντιστοίχιση πριν τη δημιουργία πρόχειρης εισαγωγής."
          />
          <h2
            ref={mappingHeadingRef}
            tabIndex={-1}
            className="sr-only"
          >
            Αντιστοίχιση στηλών
          </h2>
          <ReservationImportMapping
            headerMapping={wizard.headerMapping}
            columnMapping={wizard.columnMapping}
            autoMappedSnapshot={wizard.autoMappedSnapshot}
            delimiter={wizard.delimiter}
            delimiterOverride={wizard.delimiterOverride}
            dateFormat={wizard.dateFormat}
            dateFormatRequired={wizard.dateFormatRequired}
            missingRequiredFields={wizard.missingRequiredFields}
            bookableUnitCount={bookableUnitCount}
            onMap={wizard.updateColumnMapping}
            onDelimiterChange={wizard.updateDelimiterOverride}
            onDateFormatChange={wizard.updateDateFormat}
          />
        </Surface>
      ) : null}

      {wizard.parseResult ? (
        <Surface variant="panel" padding="md" className="space-y-4">
          <SurfaceHeader title="3. Προεπισκόπηση" />
          <ReservationImportPreview
            parseResult={wizard.parseResult}
            structuralRowErrors={wizard.structuralRowErrors}
            fileOrMappingErrors={wizard.fileOrMappingErrors}
          />
          {wizard.fileOrMappingErrors.length > 0 ||
          wizard.structuralRowErrors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
              {[...wizard.fileOrMappingErrors, ...wizard.structuralRowErrors]
                .slice(0, 8)
                .map((issue, idx) => (
                  <li key={`${issue.code}-${idx}`}>
                    {csvIssueMessageEl(issue)}
                  </li>
                ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              ref={createFocusRef}
              disabled={!wizard.canCreate || wizard.creating}
              onClick={() => void handleCreate()}
            >
              {wizard.creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Δημιουργία…
                </>
              ) : (
                "Δημιουργία πρόχειρης εισαγωγής"
              )}
            </Button>
            {wizard.createError ? (
              <p className="text-sm text-destructive" role="alert">
                {wizard.createError}
              </p>
            ) : null}
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
