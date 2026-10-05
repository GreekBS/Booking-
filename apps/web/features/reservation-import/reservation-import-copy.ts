/** Operator-facing Greek copy for CSV reservation-import (B3.1 / B3.2). */

export const RESERVATION_IMPORT_DRAFT_TTL_MESSAGE =
  "Το πρόχειρο θα διατηρηθεί για 3 ημέρες.";

export const RESERVATION_IMPORT_DRAFT_TTL_AFTER_CREATE =
  "Το πρόχειρο θα διατηρηθεί για 3 ημέρες μετά τη δημιουργία του.";

export const RESERVATION_IMPORT_DISCARD_TITLE = "Απόρριψη πρόχειρης εισαγωγής";

export const RESERVATION_IMPORT_DISCARD_DESCRIPTION =
  "Θέλετε να απορρίψετε αυτή την πρόχειρη εισαγωγή;";

export const RESERVATION_IMPORT_EXPIRED_MESSAGE =
  "Το πρόχειρο έχει λήξει και δεν μπορεί πλέον να συνεχιστεί.";

export const RESERVATION_IMPORT_NOT_FOUND_MESSAGE =
  "Η πρόχειρη εισαγωγή δεν βρέθηκε.";

export const RESERVATION_IMPORT_LOAD_LIST_ERROR =
  "Αποτυχία φόρτωσης πρόχειρων εισαγωγών.";

export const RESERVATION_IMPORT_LOAD_DRAFT_ERROR =
  "Αποτυχία φόρτωσης πρόχειρης εισαγωγής.";

export const RESERVATION_IMPORT_DISCARD_ERROR =
  "Αποτυχία απόρριψης πρόχειρης εισαγωγής.";

export const RESERVATION_IMPORT_DISCARD_SUCCESS =
  "Η πρόχειρη εισαγωγή απορρίφθηκε.";

export const RESERVATION_IMPORT_CREATE_SUCCESS =
  "Η πρόχειρη εισαγωγή δημιουργήθηκε.";

export const RESERVATION_IMPORT_CREATE_ERROR =
  "Αποτυχία δημιουργίας πρόχειρης εισαγωγής.";

export const RESERVATION_IMPORT_UNSUPPORTED_FILE =
  "Επιτρέπονται μόνο αρχεία CSV.";

export const RESERVATION_IMPORT_FILE_TOO_LARGE =
  "Το αρχείο υπερβαίνει το όριο των 2 MB.";

export const RESERVATION_IMPORT_UNPERSISTED_WARNING =
  "Ορισμένες γραμμές δεν αποθηκεύτηκαν στο πρόχειρο (π.χ. άγνωστη μονάδα). Ελέγξτε τις πριν συνεχίσετε.";

export const RESERVATION_IMPORT_RECHECK_LABEL = "Επανέλεγχος συγκρούσεων";

export const RESERVATION_IMPORT_RECHECK_DESCRIPTION =
  "Η διαθεσιμότητα και οι συγκρούσεις μπορεί να έχουν αλλάξει από την ανέβασμα του CSV.";

export const RESERVATION_IMPORT_RECHECK_SUCCESS =
  "Οι συγκρούσεις επανελέγχθηκαν. Ελέγξτε τις γραμμές που χρειάζονται ενέργεια.";

export const RESERVATION_IMPORT_RECHECK_ERROR =
  "Αποτυχία επανελέγχου συγκρούσεων.";

export const RESERVATION_IMPORT_REVIEW_TITLE = "Ανασκόπηση πρόχειρης εισαγωγής";

/** Phase C2 — commit workflow copy */
export const RESERVATION_IMPORT_COMMIT_LABEL = "Ολοκλήρωση εισαγωγής";

export const RESERVATION_IMPORT_COMMIT_CONFIRM_TITLE = "Ολοκλήρωση εισαγωγής;";

export const RESERVATION_IMPORT_COMMIT_CONFIRM_BODY = (
  importCount: number,
  skipCount: number,
  replacementCount: number,
) => {
  const parts = [
    `Θα δημιουργηθούν ${importCount} κρατήσεις από τις έτοιμες γραμμές.`,
    skipCount > 0
      ? `${skipCount} γραμμές θα παραλειφθούν χωρίς δημιουργία κράτησης.`
      : null,
    replacementCount > 0
      ? `${replacementCount} υπάρχουσες κρατήσεις που επιλέχθηκαν με «Διατήρηση CSV» θα αντικατασταθούν (supersede) από τις εισαγόμενες — δεν διαγράφονται οριστικά.`
      : null,
    "Η ενέργεια εφαρμόζει τις ήδη αποθηκευμένες αποφάσεις τιμής και σύγκρουσης.",
  ];
  return parts.filter(Boolean).join(" ");
};

export const RESERVATION_IMPORT_COMMIT_SUCCESS =
  "Η εισαγωγή ολοκληρώθηκε επιτυχώς.";

export const RESERVATION_IMPORT_COMMIT_ERROR =
  "Αποτυχία ολοκλήρωσης εισαγωγής.";

export const RESERVATION_IMPORT_COMMIT_STALE_ERROR =
  "Η διαθεσιμότητα ή οι συγκρούσεις άλλαξαν. Δεν δημιουργήθηκε καμία κράτηση. Ελέγξτε ξανά και δοκιμάστε πάλι.";

export const RESERVATION_IMPORT_COMMIT_NOT_READY_ERROR =
  "Η εισαγωγή δεν είναι ακόμη έτοιμη για ολοκλήρωση. Ανανεώστε και ολοκληρώστε τις εκκρεμότητες.";

export const RESERVATION_IMPORT_COMMIT_REFETCH_ERROR =
  "Η ολοκλήρωση μπορεί να πέτυχε, αλλά απέτυχε η ανανέωση από τον διακομιστή. Ανανεώστε για να δείτε την επίσημη κατάσταση.";

export const RESERVATION_IMPORT_COMPLETED_TITLE = "Η εισαγωγή ολοκληρώθηκε";

export const RESERVATION_IMPORT_BACK_TO_BOOKINGS = "Πίσω στις κρατήσεις";

export const RESERVATION_IMPORT_VIEW_BOOKING_LABEL = "Προβολή κράτησης";

export const RESERVATION_IMPORT_CREATED_BOOKINGS_TITLE = "Δημιουργημένες κρατήσεις";

export const RESERVATION_IMPORT_FINAL_SUMMARY_TITLE = "Σύνοψη πριν την ολοκλήρωση";

/** B3.3c conflict decision copy */
export const RESERVATION_IMPORT_CONFLICT_PROMPT =
  "Υπάρχει σύγκρουση στις ημερομηνίες. Ποια κράτηση θέλετε να διατηρήσετε;";

export const RESERVATION_IMPORT_KEEP_EXISTING_LABEL = "Διατήρηση υπάρχουσας";

export const RESERVATION_IMPORT_KEEP_CSV_LABEL = "Διατήρηση CSV";

export const RESERVATION_IMPORT_DECISION_UNDECIDED = "Δεν έχει επιλεγεί";

export const RESERVATION_IMPORT_KEEP_CSV_CONFIRM_TITLE =
  "Διατήρηση της κράτησης CSV;";

export const RESERVATION_IMPORT_KEEP_CSV_CONFIRM_ONE =
  "Η κράτηση CSV θα επιλεγεί για εισαγωγή αντί της υπάρχουσας κράτησης που επικαλύπτεται στις ίδιες ημερομηνίες. Η υπάρχουσα κράτηση δεν θα αλλάξει ακόμη. Η τελική αντικατάσταση θα γίνει μόνο κατά την ολοκλήρωση της εισαγωγής.";

export const RESERVATION_IMPORT_KEEP_CSV_CONFIRM_MANY = (count: number) =>
  `Η κράτηση CSV θα επιλεγεί για εισαγωγή αντί των ${count} υπαρχουσών κρατήσεων που επικαλύπτονται στις ίδιες ημερομηνίες. Οι υπάρχουσες κρατήσεις δεν θα αλλάξουν ακόμη. Η τελική αντικατάσταση θα γίνει μόνο κατά την ολοκλήρωση της εισαγωγής.`;

export const RESERVATION_IMPORT_KEEP_CSV_CONFIRM_PEERS =
  "Η κράτηση CSV αυτής της γραμμής θα επιλεγεί έναντι άλλων επικαλυπτόμενων γραμμών CSV. Η τελική εισαγωγή θα γίνει μόνο κατά την ολοκλήρωση της εισαγωγής.";

export const RESERVATION_IMPORT_DECISION_SUCCESS =
  "Η απόφαση σύγκρουσης αποθηκεύτηκε.";

export const RESERVATION_IMPORT_DECISION_ERROR =
  "Αποτυχία αποθήκευσης απόφασης σύγκρουσης.";

export const RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR =
  "Η απόφαση μπορεί να αποθηκεύτηκε, αλλά απέτυχε η ανανέωση από τον διακομιστή. Ανανεώστε για να δείτε την επίσημη κατάσταση.";

export const RESERVATION_IMPORT_HARD_BLOCKER_NO_DECISION =
  "Αυτή η κράτηση δεν μπορεί να προχωρήσει μέχρι να επιλυθεί το μπλοκ ημερολογίου εκτός αυτής της εισαγωγής.";

export const RESERVATION_IMPORT_KEEP_CSV_NOT_YET_REPLACED =
  "Η υπάρχουσα κράτηση δεν διαγράφεται τώρα. Η αντικατάσταση γίνεται μόνο στην ολοκλήρωση εισαγωγής.";

/** B3.3d pricing copy */
export const RESERVATION_IMPORT_PRICE_MISSING_LABEL = "Χωρίς τιμή";

export const RESERVATION_IMPORT_USE_TALOS_PRICE_LABEL = "Χρήση τιμής TALOS";

export const RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_LABEL =
  "Χρήση τιμής TALOS για όλες τις κρατήσεις χωρίς τιμή";

export const RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_HINT =
  "Εφαρμόζεται μόνο σε κρατήσεις χωρίς τιμή. Οι τιμές CSV και οι χειροκίνητες τιμές δεν αλλάζουν.";

export const RESERVATION_IMPORT_MANUAL_PRICE_LABEL = "Χειροκίνητη τιμή";

export const RESERVATION_IMPORT_MANUAL_PRICE_FIELD =
  "Συνολική τιμή κράτησης";

export const RESERVATION_IMPORT_MANUAL_PRICE_HINT =
  "Ορίστε τη συνολική τιμή για ολόκληρη τη διαμονή.";

export const RESERVATION_IMPORT_MANUAL_PRICE_SAVE = "Αποθήκευση τιμής";

export const RESERVATION_IMPORT_MANUAL_PRICE_EDIT = "Επεξεργασία τιμής";

export const RESERVATION_IMPORT_PRICE_SUCCESS = "Η τιμή αποθηκεύτηκε.";

export const RESERVATION_IMPORT_PRICE_ERROR = "Αποτυχία αποθήκευσης τιμής.";

export const RESERVATION_IMPORT_PRICE_BATCH_SUCCESS =
  "Οι τιμές TALOS εφαρμόστηκαν στις κρατήσεις χωρίς τιμή.";

export const RESERVATION_IMPORT_PRICE_BATCH_ERROR =
  "Αποτυχία εφαρμογής τιμών TALOS για όλες τις κρατήσεις χωρίς τιμή.";

export const RESERVATION_IMPORT_TALOS_UNAVAILABLE =
  "Δεν ήταν δυνατός ο υπολογισμός τιμής από το TALOS. Μπορείτε να ορίσετε τη συνολική τιμή χειροκίνητα.";

export const RESERVATION_IMPORT_MANUAL_PRICE_INVALID =
  "Εισαγάγετε έγκυρη συνολική τιμή μεγαλύτερη από το μηδέν.";

export const RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT = "EUR";
