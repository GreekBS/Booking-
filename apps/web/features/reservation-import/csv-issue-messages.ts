import type { CsvImportCanonicalField, CsvImportIssue } from "@hcp/domain";
import { csvFieldLabelEl } from "./csv-field-labels";

const CODE_MESSAGES_EL: Record<string, string> = {
  CSV_EMPTY_FILE: "Το αρχείο CSV είναι κενό.",
  CSV_TOO_LARGE: "Το αρχείο υπερβαίνει το όριο των 2 MB.",
  CSV_FILE_TOO_LARGE: "Το αρχείο υπερβαίνει το όριο των 2 MB.",
  CSV_INVALID_UTF8: "Το αρχείο πρέπει να είναι σε κωδικοποίηση UTF-8.",
  CSV_INVALID_ENCODING: "Το αρχείο πρέπει να είναι σε κωδικοποίηση UTF-8.",
  CSV_BINARY_CONTENT: "Το αρχείο φαίνεται δυαδικό και δεν μπορεί να διαβαστεί ως CSV.",
  CSV_TOO_MANY_ROWS: "Το αρχείο υπερβαίνει το όριο των 500 γραμμών δεδομένων.",
  CSV_NO_HEADERS: "Το αρχείο δεν έχει κεφαλίδες στηλών.",
  CSV_NO_DATA_ROWS: "Το αρχείο έχει κεφαλίδες αλλά δεν έχει γραμμές δεδομένων.",
  CSV_PARSE_ERROR: "Το αρχείο CSV δεν μπόρεσε να αναλυθεί.",
  CSV_MALFORMED: "Το αρχείο CSV δεν μπόρεσε να αναλυθεί.",
  CSV_EMPTY_HEADER: "Υπάρχει κενή κεφαλίδα στήλης.",
  CSV_DUPLICATE_HEADER: "Υπάρχει διπλότυπη κεφαλίδα στήλης.",
  CSV_AMBIGUOUS_MAPPING: "Περισσότερες από μία στήλες αντιστοιχούν στο ίδιο πεδίο.",
  CSV_MISSING_REQUIRED_MAPPING: "Λείπει υποχρεωτική στήλη.",
  DATE_FORMAT_REQUIRED:
    "Οι ημερομηνίες είναι διφορούμενες. Επιλέξτε μορφή ημερομηνίας.",
  DATE_MISSING: "Απαιτείται ημερομηνία.",
  DATE_UNRECOGNIZED: "Μη αναγνωρίσιμη ημερομηνία.",
  DATE_INVALID: "Μη έγκυρη ημερομηνία.",
  REQUIRED_EXTERNAL_REFERENCE: "Απαιτείται κωδικός κράτησης.",
  REQUIRED_UNIT_REF: "Λείπει δωμάτιο για κατάλυμα με πολλές μονάδες.",
  REQUIRED_GUEST_NAME: "Απαιτείται όνομα επισκέπτη.",
  REQUIRED_GUEST_EMAIL: "Απαιτείται email επισκέπτη.",
  INVALID_GUEST_EMAIL: "Μη έγκυρο email επισκέπτη.",
  REQUIRED_CHECK_IN: "Απαιτείται ημερομηνία άφιξης.",
  REQUIRED_CHECK_OUT: "Απαιτείται ημερομηνία αναχώρησης.",
  INVALID_STAY_PERIOD: "Μη έγκυρες ημερομηνίες — η αναχώρηση πρέπει να είναι μετά την άφιξη.",
  REQUIRED_GUEST_COUNT: "Απαιτείται αριθμός επισκεπτών.",
  INVALID_GUEST_COUNT: "Μη έγκυρος αριθμός επισκεπτών.",
  INVALID_PRICE: "Μη έγκυρη τιμή.",
  UNIT_NOT_FOUND: "Άγνωστο δωμάτιο.",
  UNIT_AMBIGUOUS: "Η αναφορά δωματίου αντιστοιχεί σε περισσότερες από μία μονάδες.",
  UNIT_UNRESOLVED: "Το δωμάτιο δεν μπόρεσε να αντιστοιχηθεί.",
  UNIT_NOT_FOUND_CATALOG: "Άγνωστο δωμάτιο.",
  MISSING_REQUIRED_FIELD: "Λείπει υποχρεωτική στήλη.",
  DUPLICATE_FIELD_MAPPING: "Η ίδια στήλη TALOS αντιστοιχίστηκε περισσότερες φορές.",
  EMPTY_HEADER: "Υπάρχει κενή κεφαλίδα στήλης.",
  DUPLICATE_HEADER: "Υπάρχει διπλότυπη κεφαλίδα στήλης.",
};

export function csvIssueMessageEl(issue: CsvImportIssue): string {
  const base = CODE_MESSAGES_EL[issue.code] ?? issue.message;
  const field =
    issue.field != null
      ? ` (${csvFieldLabelEl(issue.field as CsvImportCanonicalField)})`
      : "";
  if (issue.rowNumber != null) {
    return `Γραμμή ${issue.rowNumber}: ${base}${field}`;
  }
  return `${base}${field}`;
}

export function csvIssueCodeKnown(code: string): boolean {
  return code in CODE_MESSAGES_EL;
}
