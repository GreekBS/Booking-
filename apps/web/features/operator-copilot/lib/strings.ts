/** UI copy for the Operator Copilot (admin UI is Greek-first). */
export const copilotStrings = {
  productName: "Talos AI",
  avatarLabel: "Talos AI Operator Copilot",
  avatarInitials: "TA",
  panelLabel: "Talos AI Operator Copilot",
  subtitleReadOnly: "Βοηθός μόνο για ανάγνωση",
  activePropertyPrefix: "Κατάλυμα:",
  close: "Κλείσιμο",
  newChat: "Νέα συνομιλία",
  send: "Αποστολή",
  inputLabel: "Μήνυμα προς Talos AI",
  inputPlaceholder: "Ρωτήστε για κρατήσεις, διαθεσιμότητα, καθαριότητα…",
  emptyTitle: "Πώς μπορώ να βοηθήσω;",
  emptyBody:
    "Ρωτήστε για τις αφίξεις της ημέρας, τη διαθεσιμότητα, τις κρατήσεις ή την καθαριότητα. Διαβάζω μόνο δεδομένα — δεν κάνω αλλαγές.",
  thinking: "Το Talos AI σκέφτεται…",
  loadingHistory: "Φόρτωση συνομιλίας…",
  genericError: "Δεν ήταν δυνατή η αποστολή. Δοκιμάστε ξανά.",
  loadError: "Δεν ήταν δυνατή η φόρτωση της συνομιλίας.",
  operatorLabel: "Εσείς",
  assistantLabel: "Talos AI",
  unreadLabel: (count: number) =>
    count === 1 ? "1 νέα απάντηση" : `${count} νέες απαντήσεις`,
} as const;
