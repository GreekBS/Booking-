"use client";

import type {
  CsvImportCanonicalField,
  CsvImportDateFormat,
  CsvImportDelimiter,
  CsvImportHeaderMappingResult,
} from "@hcp/domain";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_CSV_CANONICAL_FIELDS,
  csvFieldLabelEl,
  isRequiredCsvField,
} from "./csv-field-labels";
import type { WizardColumnMapping } from "./useReservationImportWizard";

interface ReservationImportMappingProps {
  headerMapping: CsvImportHeaderMappingResult;
  columnMapping: WizardColumnMapping;
  autoMappedSnapshot: Record<string, CsvImportCanonicalField>;
  delimiter: CsvImportDelimiter | null;
  delimiterOverride: CsvImportDelimiter | "";
  dateFormat: CsvImportDateFormat | "";
  dateFormatRequired: boolean;
  missingRequiredFields: readonly CsvImportCanonicalField[];
  bookableUnitCount?: number;
  disabled?: boolean;
  onMap: (header: string, field: CsvImportCanonicalField | null | "") => void;
  onDateFormatChange: (value: CsvImportDateFormat | "") => void;
  onDelimiterChange: (value: CsvImportDelimiter | "") => void;
}

function delimiterLabel(d: CsvImportDelimiter): string {
  if (d === ",") return "Κόμμα (,)";
  if (d === ";") return "Ελληνικό ερωτηματικό (;)";
  return "Tab";
}

export function ReservationImportMapping({
  headerMapping,
  columnMapping,
  autoMappedSnapshot,
  delimiter,
  delimiterOverride,
  dateFormat,
  dateFormatRequired,
  missingRequiredFields,
  bookableUnitCount,
  disabled,
  onMap,
  onDateFormatChange,
  onDelimiterChange,
}: ReservationImportMappingProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="csv-delimiter">Διαχωριστικό</Label>
          <Select
            value={delimiterOverride === "" ? "auto" : delimiterOverride === "\t" ? "tab" : delimiterOverride}
            onValueChange={(v) => {
              if (v === "auto") onDelimiterChange("");
              else if (v === "tab") onDelimiterChange("\t");
              else onDelimiterChange(v as CsvImportDelimiter);
            }}
            disabled={disabled}
          >
            <SelectTrigger id="csv-delimiter" aria-label="Διαχωριστικό CSV">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                Αυτόματο{delimiter ? ` · ${delimiterLabel(delimiter)}` : ""}
              </SelectItem>
              <SelectItem value=",">Κόμμα (,)</SelectItem>
              <SelectItem value=";">Ελληνικό ερωτηματικό (;)</SelectItem>
              <SelectItem value="tab">Tab</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="csv-date-format">
            Μορφή ημερομηνίας{dateFormatRequired ? " (απαιτείται)" : ""}
          </Label>
          <Select
            value={dateFormat === "" ? "unset" : dateFormat}
            onValueChange={(v) =>
              onDateFormatChange(v === "unset" ? "" : (v as CsvImportDateFormat))
            }
            disabled={disabled}
          >
            <SelectTrigger
              id="csv-date-format"
              aria-label="Μορφή ημερομηνίας"
              aria-invalid={dateFormatRequired || undefined}
            >
              <SelectValue placeholder="Επιλέξτε μορφή" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Αυτόματη / ISO όπου ξεκάθαρο</SelectItem>
              <SelectItem value="iso">ΕΕΕΕ-ΜΜ-ΗΗ (ISO)</SelectItem>
              <SelectItem value="dmy">ΗΗ/ΜΜ/ΕΕΕΕ</SelectItem>
              <SelectItem value="mdy">ΜΜ/ΗΗ/ΕΕΕΕ</SelectItem>
            </SelectContent>
          </Select>
          {dateFormatRequired ? (
            <p className="text-xs text-destructive" role="alert">
              Οι ημερομηνίες είναι διφορούμενες. Επιλέξτε μορφή.
            </p>
          ) : null}
        </div>
      </div>

      {missingRequiredFields.length > 0 ? (
        <p className="text-sm text-destructive" role="alert">
          Λείπουν υποχρεωτικά πεδία:{" "}
          {missingRequiredFields.map(csvFieldLabelEl).join(", ")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Όλα τα υποχρεωτικά πεδία έχουν αντιστοιχιστεί.
        </p>
      )}

      <ul className="space-y-2" aria-label="Αντιστοίχιση στηλών CSV">
        {headerMapping.headers.map((header) => {
          const mapped = columnMapping[header] ?? null;
          const auto = autoMappedSnapshot[header];
          const selectValue = mapped ?? "__ignore__";
          return (
            <li
              key={header}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {header || "(κενή κεφαλίδα)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {auto
                      ? `Αυτόματη αντιστοίχιση: ${csvFieldLabelEl(auto)}`
                      : "Χωρίς αυτόματη αντιστοίχιση"}
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <Label className="sr-only" htmlFor={`map-${header}`}>
                    Αντιστοίχιση για {header}
                  </Label>
                  <Select
                    value={selectValue}
                    onValueChange={(v) =>
                      onMap(
                        header,
                        v === "__ignore__" ? null : (v as CsvImportCanonicalField),
                      )
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger id={`map-${header}`} aria-label={`Αντιστοίχιση ${header}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ignore__">Να αγνοηθεί</SelectItem>
                      {ALL_CSV_CANONICAL_FIELDS.map((field) => (
                        <SelectItem key={field} value={field}>
                          {csvFieldLabelEl(field)}
                          {isRequiredCsvField(field, bookableUnitCount)
                            ? " · υποχρεωτικό"
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
