"use client";

import type { CsvImportCanonicalRow, CsvImportIssue, CsvImportParseResult } from "@hcp/domain";
import { StatusBadge } from "@/components/admin/status-badge";
import { csvIssueMessageEl } from "./csv-issue-messages";

interface ReservationImportPreviewProps {
  parseResult: CsvImportParseResult;
  structuralRowErrors: CsvImportIssue[];
  fileOrMappingErrors: CsvImportIssue[];
}

function formatPreviewDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

function formatPreviewAmount(row: CsvImportCanonicalRow): string {
  if (row.price.status === "present") {
    const amount = row.price.amount;
    const currency = row.price.currency ?? row.currency;
    if (currency === "EUR" || !currency) return `€${amount}`;
    return `${amount} ${currency}`;
  }
  if (row.price.status === "missing") return "—";
  return "Μη έγκυρη";
}

function rowProblemMessage(row: CsvImportCanonicalRow): string | null {
  if (row.errors.length === 0) return null;
  return row.errors.map((issue) => csvIssueMessageEl(issue)).join(" · ");
}

function rowStatusLabel(row: CsvImportCanonicalRow): {
  label: string;
  ready: boolean;
} {
  if (row.errors.length > 0 || !row.structurallyImportable) {
    return { label: "Πρόβλημα", ready: false };
  }
  if (row.temporalClass === "historical") {
    return { label: "Έτοιμη (ιστορική)", ready: true };
  }
  return { label: "Έτοιμη", ready: true };
}

/**
 * Pre-draft Preview — read-only parse output. Creates no Booking/Hold/Quote/inventory.
 */
export function ReservationImportPreview({
  parseResult,
  structuralRowErrors,
  fileOrMappingErrors,
}: ReservationImportPreviewProps) {
  const readyCount = parseResult.rows.filter(
    (r) => r.structurallyImportable && r.errors.length === 0,
  ).length;
  const attentionCount = parseResult.rows.length - readyCount;
  const fileErrorCount = fileOrMappingErrors.length;
  const missingPriceCount = parseResult.rows.filter(
    (r) => r.price.status === "missing",
  ).length;
  const issueSample = [...fileOrMappingErrors, ...structuralRowErrors].slice(
    0,
    12,
  );
  const errorCount = structuralRowErrors.length + fileOrMappingErrors.length;

  return (
    <div className="space-y-4" data-testid="reservation-import-preview">
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">
          {parseResult.rowCount}{" "}
          {parseResult.rowCount === 1 ? "κράτηση βρέθηκε" : "κρατήσεις βρέθηκαν"}
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusBadge status="confirmed" label={`${readyCount} Έτοιμες`} />
          <StatusBadge
            status={attentionCount > 0 ? "cancelled" : "completed"}
            label={`${attentionCount} Χρειάζονται προσοχή`}
          />
          {fileErrorCount > 0 ? (
            <StatusBadge
              status="cancelled"
              label={`${fileErrorCount} σφάλματα αρχείου`}
            />
          ) : null}
          {missingPriceCount > 0 ? (
            <StatusBadge
              status="pending"
              label={`${missingPriceCount} χωρίς τιμή`}
            />
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" role="note">
        Προεπισκόπηση μόνο — δεν δημιουργούνται κρατήσεις ακόμη. Η εισαγωγή
        γίνεται μόνο αφού επιβεβαιώσετε στο επόμενο βήμα.
      </p>

      {issueSample.length > 0 ? (
        <ul
          className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          role="alert"
          data-testid="reservation-import-preview-issues"
        >
          {issueSample.map((issue, idx) => (
            <li key={`${issue.code}-${issue.rowNumber ?? "f"}-${idx}`}>
              {csvIssueMessageEl(issue)}
            </li>
          ))}
          {errorCount > issueSample.length ? (
            <li>…και {errorCount - issueSample.length} ακόμη</li>
          ) : null}
        </ul>
      ) : null}

      <div className="max-h-[min(28rem,60vh)] overflow-auto rounded-md border border-border">
        <table className="min-w-[56rem] w-full text-left text-xs sm:text-sm">
          <thead className="sticky top-0 bg-muted/95 text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Επισκέπτης</th>
              <th className="px-3 py-2 font-medium">Άφιξη</th>
              <th className="px-3 py-2 font-medium">Αναχώρηση</th>
              <th className="px-3 py-2 font-medium">Δωμάτιο</th>
              <th className="px-3 py-2 font-medium">Επισκέπτες</th>
              <th className="px-3 py-2 font-medium">Τηλέφωνο</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Ποσό</th>
              <th className="px-3 py-2 font-medium">Αναφορά</th>
              <th className="px-3 py-2 font-medium">Κατάσταση</th>
            </tr>
          </thead>
          <tbody>
            {parseResult.rows.map((row) => {
              const status = rowStatusLabel(row);
              const problem = rowProblemMessage(row);
              return (
                <tr
                  key={row.rowNumber}
                  className={
                    status.ready
                      ? "border-t border-border"
                      : "border-t border-destructive/25 bg-destructive/5"
                  }
                  data-testid={`import-preview-row-${row.rowNumber}`}
                  data-preview-ready={status.ready ? "true" : "false"}
                >
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {row.rowNumber}
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {row.guestName ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatPreviewDate(row.checkIn)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatPreviewDate(row.checkOut)}
                  </td>
                  <td className="px-3 py-2">{row.unitRef ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.guestCount ?? "—"}
                  </td>
                  <td className="px-3 py-2">{row.guestPhone ?? "—"}</td>
                  <td className="px-3 py-2 break-all">
                    {row.guestEmail ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatPreviewAmount(row)}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {row.externalReference ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <StatusBadge
                        status={status.ready ? "confirmed" : "cancelled"}
                        label={status.label}
                      />
                      {problem ? (
                        <p className="max-w-[14rem] text-[11px] leading-snug text-destructive">
                          {problem}
                        </p>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
