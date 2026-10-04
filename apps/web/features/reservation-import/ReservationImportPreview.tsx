"use client";

import type { CsvImportIssue, CsvImportParseResult } from "@hcp/domain";
import { StatusBadge } from "@/components/admin/status-badge";
import { csvIssueMessageEl } from "./csv-issue-messages";

interface ReservationImportPreviewProps {
  parseResult: CsvImportParseResult;
  structuralRowErrors: CsvImportIssue[];
  fileOrMappingErrors: CsvImportIssue[];
}

export function ReservationImportPreview({
  parseResult,
  structuralRowErrors,
  fileOrMappingErrors,
}: ReservationImportPreviewProps) {
  const errorCount = structuralRowErrors.length + fileOrMappingErrors.length;
  const missingPriceCount = parseResult.rows.filter(
    (r) => r.price.status === "missing",
  ).length;
  const historicalCount = parseResult.rows.filter(
    (r) => r.temporalClass === "historical",
  ).length;
  const sample = parseResult.rows.slice(0, 8);
  const issueSample = [...fileOrMappingErrors, ...structuralRowErrors].slice(0, 12);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
        <StatusBadge
          status="draft"
          label={`${parseResult.rowCount} γραμμές`}
        />
        <StatusBadge
          status="confirmed"
          label={`${parseResult.structurallyImportableCount} έγκυρες`}
        />
        <StatusBadge
          status={errorCount > 0 ? "cancelled" : "completed"}
          label={`${errorCount} σφάλματα`}
        />
        {missingPriceCount > 0 ? (
          <StatusBadge
            status="pending"
            label={`${missingPriceCount} χωρίς τιμή`}
          />
        ) : null}
        {historicalCount > 0 ? (
          <StatusBadge
            status="completed"
            label={`${historicalCount} ιστορικές`}
          />
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Η έλλειψη τιμής δεν εμποδίζει τη δημιουργία προχείρου. Οι ιστορικές
        κρατήσεις επιτρέπονται.
      </p>

      {issueSample.length > 0 ? (
        <ul
          className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          role="alert"
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

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Επισκέπτης</th>
              <th className="px-3 py-2 font-medium">Μονάδα</th>
              <th className="px-3 py-2 font-medium">Άφιξη</th>
              <th className="px-3 py-2 font-medium">Αναχώρηση</th>
              <th className="px-3 py-2 font-medium">Τιμή</th>
              <th className="px-3 py-2 font-medium">Κατάσταση</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((row) => {
              const hasError = row.errors.length > 0;
              const priceLabel =
                row.price.status === "present"
                  ? `${row.price.amount}${row.price.currency ? ` ${row.price.currency}` : ""}`
                  : row.price.status === "missing"
                    ? "Χωρίς τιμή"
                    : "Μη έγκυρη τιμή";
              return (
                <tr key={row.rowNumber} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{row.rowNumber}</td>
                  <td className="px-3 py-2">{row.guestName ?? "—"}</td>
                  <td className="px-3 py-2">{row.unitRef ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.checkIn ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.checkOut ?? "—"}</td>
                  <td className="px-3 py-2">{priceLabel}</td>
                  <td className="px-3 py-2">
                    {hasError
                      ? "Σφάλμα"
                      : row.temporalClass === "historical"
                        ? "Ιστορική"
                        : "Έγκυρη"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {parseResult.rowCount > sample.length ? (
        <p className="text-xs text-muted-foreground">
          Εμφανίζονται οι πρώτες {sample.length} από {parseResult.rowCount} γραμμές.
        </p>
      ) : null}
    </div>
  );
}
