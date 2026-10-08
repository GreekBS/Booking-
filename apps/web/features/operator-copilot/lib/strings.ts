/** UI copy for the Operator Copilot (admin UI is Greek-first). */
export const copilotStrings = {
  productName: "Talia",
  avatarLabel: "Talia Operator Copilot",
  panelLabel: "Talia Operator Copilot",
  subtitle: "Ο AI βοηθός σας στο Talos",
  /** Kept for callers that still surface Active Property context elsewhere. */
  activePropertyPrefix: "Κατάλυμα:",
  close: "Κλείσιμο",
  newChat: "Νέα συνομιλία",
  send: "Αποστολή",
  inputLabel: "Μήνυμα προς Talia",
  inputPlaceholder: "Ρωτήστε για κρατήσεις, διαθεσιμότητα, καθαριότητα…",
  emptyTitle: "Πώς μπορώ να βοηθήσω;",
  emptyBody:
    "Ρωτήστε για τις αφίξεις της ημέρας, τη διαθεσιμότητα, τις κρατήσεις ή την καθαριότητα. Διαβάζω μόνο δεδομένα — δεν κάνω αλλαγές.",
  thinking: "Η Talia σκέφτεται…",
  skipTyping: "Εμφάνιση πλήρους απάντησης",
  loadingHistory: "Φόρτωση συνομιλίας…",
  genericError: "Δεν ήταν δυνατή η αποστολή. Δοκιμάστε ξανά.",
  loadError: "Δεν ήταν δυνατή η φόρτωση της συνομιλίας.",
  operatorLabel: "Εσείς",
  assistantLabel: "Talia",
  unreadLabel: (count: number) =>
    count === 1 ? "1 νέα απάντηση" : `${count} νέες απαντήσεις`,
} as const;
