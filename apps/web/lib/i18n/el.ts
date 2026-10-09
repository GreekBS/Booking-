/**
 * Talos operator panel — Greek (el) presentation strings.
 *
 * Domain enums / API values are never renamed. These maps are UI-only.
 * Locale is fixed to Greek for the authenticated PMS panel.
 */

/** Shared actions / chrome used across modules. */
export const elCommon = {
  save: "Αποθήκευση",
  cancel: "Ακύρωση",
  confirm: "Επιβεβαίωση",
  edit: "Επεξεργασία",
  delete: "Διαγραφή",
  remove: "Αφαίρεση",
  search: "Αναζήτηση",
  create: "Δημιουργία",
  add: "Προσθήκη",
  update: "Ενημέρωση",
  close: "Κλείσιμο",
  back: "Πίσω",
  next: "Επόμενο",
  previous: "Προηγούμενο",
  continue: "Συνέχεια",
  submit: "Υποβολή",
  refresh: "Ανανέωση",
  retry: "Δοκιμάστε ξανά",
  loading: "Φόρτωση…",
  saving: "Αποθήκευση…",
  required: "Υποχρεωτικό",
  optional: "Προαιρετικό",
  yes: "Ναι",
  no: "Όχι",
  all: "Όλα",
  none: "Κανένα",
  actions: "Ενέργειες",
  details: "Λεπτομέρειες",
  status: "Κατάσταση",
  date: "Ημερομηνία",
  from: "Από",
  to: "Έως",
  name: "Όνομα",
  email: "Email",
  phone: "Τηλέφωνο",
  notes: "Σημειώσεις",
  description: "Περιγραφή",
  property: "Κατάλυμα",
  properties: "Καταλύματα",
  unit: "Μονάδα",
  units: "Μονάδες",
  /** Customer-facing label for the default whole-property unit (internal name: Entire Property). */
  entireProperty: "Ολόκληρο κατάλυμα",
  guest: "Επισκέπτης",
  guests: "Επισκέπτες",
  booking: "Κράτηση",
  bookings: "Κρατήσεις",
  today: "Σήμερα",
  yesterday: "Χθες",
  tomorrow: "Αύριο",
  somethingWentWrong: "Κάτι πήγε στραβά",
  tryAgain: "Δοκιμάστε ξανά",
  noResults: "Δεν βρέθηκαν αποτελέσματα",
  noData: "Δεν υπάρχουν δεδομένα",
  viewAll: "Προβολή όλων",
  showMore: "Περισσότερα",
  showLess: "Λιγότερα",
  copy: "Αντιγραφή",
  print: "Εκτύπωση",
  download: "Λήψη",
  upload: "Μεταφόρτωση",
  filter: "Φίλτρο",
  filters: "Φίλτρα",
  clearFilters: "Καθαρισμός φίλτρων",
  sortBy: "Ταξινόμηση",
  selected: "Επιλεγμένα",
  select: "Επιλογή",
  selectAll: "Επιλογή όλων",
  unselectAll: "Αποεπιλογή όλων",
  open: "Άνοιγμα",
  collapse: "Σύμπτυξη",
  expand: "Ανάπτυξη",
  signOut: "Αποσύνδεση",
  account: "Λογαριασμός",
  tenant: "Οργανισμός",
  switchTenant: "Αλλαγή οργανισμού",
  openNavigation: "Άνοιγμα μενού",
  activeProperty: "Ενεργό κατάλυμα",
  noTenantContext: "Δεν υπάρχει πλαίσιο οργανισμού",
  noProperty: "Δεν υπάρχει κατάλυμα",
  selectProperty: "Επιλέξτε κατάλυμα",
  createProperty: "Δημιουργία καταλύματος",
  addProperty: "Προσθήκη καταλύματος",
  archive: "Αρχειοθέτηση",
  aiAssistant: "Βοηθός AI",
  guestMessaging: "Μηνύματα επισκέπτη",
  comingSoon: "Σύντομα",
  notificationsComingSoon: "Ειδοποιήσεις (σύντομα)",
  new: "Νέο",
  page: "Σελίδα",
  of: "από",
  rowsPerPage: "Γραμμές ανά σελίδα",
  total: "Σύνολο",
  amount: "Ποσό",
  currency: "Νόμισμα",
  timezone: "Ζώνη ώρας",
  type: "Τύπος",
  source: "Πηγή",
  priority: "Προτεραιότητα",
  assignedTo: "Ανάθεση σε",
  createdAt: "Δημιουργήθηκε",
  updatedAt: "Ενημερώθηκε",
  startedAt: "Έναρξη",
  completedAt: "Ολοκλήρωση",
  dueAt: "Προθεσμία",
  checkIn: "Άφιξη",
  checkOut: "Αναχώρηση",
  nights: "Νύχτες",
  adults: "Ενήλικες",
  children: "Παιδιά",
  capacity: "Χωρητικότητα",
  maxGuests: "Μέγ. επισκέπτες",
  available: "Διαθέσιμο",
  connected: "Συνδεδεμένα",
  loadMoreMonths: "Φόρτωση περισσότερων μηνών",
} as const;

/** Sidebar / section navigation. */
export const elNav = {
  overview: "Επισκόπηση",
  dashboard: "Πίνακας ελέγχου",
  operations: "Λειτουργίες",
  bookings: "Κρατήσεις",
  availability: "Διαθεσιμότητα",
  guests: "Επισκέπτες",
  messages: "Μηνύματα",
  housekeeping: "Καθαριότητα",
  revenue: "Έσοδα",
  pricing: "Τιμές",
  payments: "Πληρωμές",
  fiscalDocuments: "Παραστατικά",
  distribution: "Διανομή",
  channels: "Κανάλια",
  website: "Ιστότοπος",
  property: "Κατάλυμα",
  properties: "Καταλύματα",
  units: "Μονάδες",
  amenities: "Παροχές",
  policies: "Πολιτικές",
  administration: "Διαχείριση",
  members: "Μέλη",
  settings: "Ρυθμίσεις",
  operatorNavigation: "Πλοήγηση χειριστή",
  collapseSidebar: "Σύμπτυξη πλευρικού μενού",
  expandSidebar: "Ανάπτυξη πλευρικού μενού",
  talosDashboard: "Πίνακας ελέγχου Talos",
} as const;

/**
 * Domain status → Greek label. Keys match persisted/API status values.
 * Unknown statuses fall back to a readable Greek-safe replacement.
 */
export const elStatus: Record<string, string> = {
  // generic / inventory
  active: "Ενεργό",
  ACTIVE: "Ενεργό",
  draft: "Πρόχειρο",
  DRAFT: "Πρόχειρο",
  inactive: "Ανενεργό",
  INACTIVE: "Ανενεργό",
  archived: "Αρχειοθετημένο",
  ARCHIVED: "Αρχειοθετημένο",
  // bookings
  pending: "Σε αναμονή",
  PENDING: "Σε αναμονή",
  payment_pending: "Εκκρεμεί πληρωμή",
  confirmed: "Επιβεβαιωμένη",
  CONFIRMED: "Επιβεβαιωμένη",
  completed: "Ολοκληρωμένη",
  COMPLETED: "Ολοκληρωμένο",
  cancelled: "Ακυρωμένη",
  CANCELLED: "Ακυρωμένο",
  // holds
  expired: "Ληγμένο",
  EXPIRED: "Ληγμένο",
  released: "Απελευθερωμένο",
  RELEASED: "Απελευθερωμένο",
  manual: "Χειροκίνητο",
  hold: "Δέσμευση",
  booking: "Κράτηση",
  // fiscal
  ISSUED: "Εκδοθέν",
  // payments
  SUCCEEDED: "Επιτυχής",
  FAILED: "Απέτυχε",
  // tasks
  OPEN: "Ανοιχτή",
  IN_PROGRESS: "Σε εξέλιξη",
  // housekeeping unit readiness
  CLEAN: "Καθαρό",
  DIRTY: "Βρώμικο",
  // channels
  paused: "Σε παύση",
  error: "Σφάλμα",
  disconnected: "Αποσυνδεδεμένο",
  pending_auth: "Απαιτείται ρύθμιση",
  // QR / cleaning execution
  REVOKED: "Ανακλημένο",
};

export function statusLabelEl(status: string): string {
  return (
    elStatus[status] ??
    elStatus[status.toUpperCase()] ??
    elStatus[status.toLowerCase()] ??
    status.replace(/_/g, " ")
  );
}

export const elChannelStatus: Record<string, string> = {
  draft: "Απαιτείται ρύθμιση",
  pending_auth: "Απαιτείται ρύθμιση",
  active: "Συνδεδεμένο",
  paused: "Σε παύση",
  error: "Προσοχή",
  disconnected: "Αποσυνδεδεμένο",
};

/** Keep provider brands in Latin where that is the product name. */
export const elChannelProvider: Record<string, string> = {
  booking_com: "Booking.com",
  ical: "iCal",
  airbnb: "Airbnb",
  expedia: "Expedia",
};

export const elMemberRole: Record<string, string> = {
  admin: "Διαχειριστής",
  manager: "Υπεύθυνος",
  owner: "Ιδιοκτήτης",
};

export const elPriority: Record<string, string> = {
  LOW: "Χαμηλή",
  NORMAL: "Κανονική",
  HIGH: "Υψηλή",
  URGENT: "Επείγουσα",
  low: "Χαμηλή",
  normal: "Κανονική",
  high: "Υψηλή",
  urgent: "Επείγουσα",
};

export const elTaskCategory: Record<string, string> = {
  HOUSEKEEPING: "Καθαριότητα",
  MAINTENANCE: "Συντήρηση",
  OPERATIONS: "Λειτουργίες",
  OTHER: "Άλλο",
  INSPECTION: "Έλεγχος",
  GUEST_REQUEST: "Αίτημα επισκέπτη",
  GENERAL: "Γενικό",
};

export function taskCategoryLabelEl(category: string): string {
  return elTaskCategory[category] ?? statusLabelEl(category);
}

/** Operator calendar block types (domain values unchanged). */
export const elOperatorBlockType: Record<string, string> = {
  manual: "Χειροκίνητο",
  maintenance: "Συντήρηση",
  cleaning: "Καθαρισμός",
  owner: "Ιδιοκτήτης",
};

export function operatorBlockLabelEl(blockType: string): string {
  return elOperatorBlockType[blockType] ?? blockType.replace(/_/g, " ");
}

export const elTaskSource: Record<string, string> = {
  MANUAL: "Χειροκίνητη",
  TURNOVER: "Αναχώρηση",
  SYSTEM: "Σύστημα",
};

/** Weekday labels (Sun=0 … Sat=6) for pricing modifiers. */
export const elWeekdaysShort = [
  "Κυρ",
  "Δευ",
  "Τρί",
  "Τετ",
  "Πέμ",
  "Παρ",
  "Σάβ",
] as const;

/** Compact weekday initials (Sun=0 … Sat=6) for Availability month-grid day cells. */
export const elWeekdaysInitials = [
  "Κυ",
  "Δε",
  "Τρ",
  "Τε",
  "Πε",
  "Πα",
  "Σα",
] as const;

export const elPaymentMethod: Record<string, string> = {
  CASH: "Μετρητά",
  CARD: "Κάρτα",
  BANK_TRANSFER: "Τραπεζική μεταφορά",
  OTA: "OTA",
  OTHER: "Άλλο",
};

export const elCollectionSource: Record<string, string> = {
  DIRECT: "Άμεση",
  PROPERTY: "Κατάλυμα",
  OTA: "OTA",
  PAYMENT_GATEWAY: "Πύλη πληρωμών",
  OTHER: "Άλλο",
};

export const elPaymentStatus: Record<string, string> = {
  PENDING: "Σε αναμονή",
  SUCCEEDED: "Επιτυχής",
  FAILED: "Απέτυχε",
  CANCELLED: "Ακυρωμένη",
};

/** Fiscal document kinds — UI labels only. */
export const elFiscalKind: Record<string, string> = {
  SERVICE_INVOICE: "Τιμολόγιο παροχής",
  SERVICE_RECEIPT: "Απόδειξη παροχής",
  SERVICE_CREDIT: "Πιστωτικό παροχής",
  RETAIL_CREDIT: "Πιστωτικό λιανικής",
  CLIMATE_RESILIENCE_FEE_RECEIPT: "Απόδειξη τέλους κλιματικής ανθεκτικότητας",
};

export function paymentMethodLabelEl(method: string): string {
  return elPaymentMethod[method] ?? method.replace(/_/g, " ");
}

export function collectionSourceLabelEl(source: string): string {
  return elCollectionSource[source] ?? source.replace(/_/g, " ");
}

export function paymentStatusLabelEl(status: string): string {
  return elPaymentStatus[status] ?? statusLabelEl(status);
}

export function fiscalDocumentKindLabelEl(kind: string): string {
  return elFiscalKind[kind] ?? kind.replace(/_/g, " ");
}
