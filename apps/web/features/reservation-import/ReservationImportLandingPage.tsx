"use client";

import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { Button } from "@/components/ui/button";
import { elCommon } from "@/lib/i18n";
import { RESERVATION_IMPORT_DRAFT_TTL_MESSAGE } from "@/features/reservation-import/reservation-import-copy";

/**
 * B3.1 landing shell for CSV reservation import.
 * Upload / mapping arrive in B3.2 — intentionally not implemented here.
 */
export function ReservationImportLandingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Εισαγωγή κρατήσεων από CSV"
        description="Εισαγάγετε πολλές κρατήσεις μαζί από αρχείο CSV. Θα ελέγξετε αντιστοιχίσεις, τιμές και συγκρούσεις πριν την τελική εισαγωγή."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/bookings">{elCommon.back}</Link>
          </Button>
        }
      />

      <Surface variant="panel" padding="md" className="space-y-4">
        <SurfaceHeader
          title="Επόμενο βήμα"
          description="Η μεταφόρτωση αρχείου και η αντιστοίχιση στηλών θα είναι διαθέσιμες στο επόμενο στάδιο."
        />
        <div className="flex items-start gap-3 rounded-md border border-dashed border-border bg-surface-subtle/60 p-4">
          <div className="rounded-full bg-muted p-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              Μεταφόρτωση CSV — σύντομα
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Εδώ θα επιλέξετε το αρχείο CSV, θα αντιστοιχίσετε τις στήλες και θα
              δημιουργήσετε πρόχειρη εισαγωγή. {RESERVATION_IMPORT_DRAFT_TTL_MESSAGE}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Αν έχετε ήδη πρόχειρη εισαγωγή, συνεχίστε από τη λίστα «Πρόχειρες εισαγωγές»
          στη σελίδα Κρατήσεις.
        </p>
      </Surface>
    </div>
  );
}
