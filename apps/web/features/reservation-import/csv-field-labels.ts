import type { CsvImportCanonicalField } from "@hcp/domain";
import {
  CSV_IMPORT_OPTIONAL_FIELDS,
  CSV_IMPORT_REQUIRED_FIELDS,
} from "@hcp/domain";

export const CSV_FIELD_LABELS_EL: Record<CsvImportCanonicalField, string> = {
  externalReference: "Κωδικός κράτησης (εξωτερικός)",
  unitRef: "Κατάλυμα / μονάδα",
  guestName: "Όνομα επισκέπτη",
  guestEmail: "Email επισκέπτη",
  guestPhone: "Τηλέφωνο επισκέπτη",
  checkIn: "Άφιξη",
  checkOut: "Αναχώρηση",
  guestCount: "Αριθμός επισκεπτών",
  totalAmount: "Συνολική τιμή",
  currency: "Νόμισμα",
  channelSource: "Πηγή / κανάλι",
  notes: "Σημειώσεις",
};

export function csvFieldLabelEl(field: CsvImportCanonicalField): string {
  return CSV_FIELD_LABELS_EL[field] ?? field;
}

export function isRequiredCsvField(field: CsvImportCanonicalField): boolean {
  return (CSV_IMPORT_REQUIRED_FIELDS as readonly string[]).includes(field);
}

export const ALL_CSV_CANONICAL_FIELDS: readonly CsvImportCanonicalField[] = [
  ...CSV_IMPORT_REQUIRED_FIELDS,
  ...CSV_IMPORT_OPTIONAL_FIELDS,
];
