/**
 * Booking.com Help Center content + screenshot manifest (CM-4c-5).
 * Screenshot slots BOOKING-HELP-01..14 — placeholders until Extranet access.
 */

export interface ChannelHelpScreenshotSlot {
  id: string;
  provider: "booking_com";
  stepOrder: number;
  caption: string;
  altText: string;
  annotation?: string;
  /** null until a real asset is available — never fabricate Booking.com UI. */
  imageSrc: string | null;
}

export const BOOKING_COM_SCREENSHOT_MANIFEST: readonly ChannelHelpScreenshotSlot[] = [
  {
    id: "BOOKING-HELP-01",
    provider: "booking_com",
    stepOrder: 1,
    caption: "Booking.com Extranet — επισκόπηση λογαριασμού",
    altText: "Placeholder για στιγμιότυπο επισκόπησης λογαριασμού Booking.com Extranet",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-02",
    provider: "booking_com",
    stepOrder: 2,
    caption: "Μενού Channel Manager στο Booking.com Extranet",
    altText: "Placeholder για στιγμιότυπο πλοήγησης Channel Manager",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-03",
    provider: "booking_com",
    stepOrder: 3,
    caption: "Αίτημα σύνδεσης Talos ως channel manager",
    altText: "Placeholder για αίτημα σύνδεσης Talos",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-04",
    provider: "booking_com",
    stepOrder: 4,
    caption: "Επιλογή τύπου σύνδεσης Reservations",
    altText: "Placeholder για τύπο σύνδεσης Reservations",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-05",
    provider: "booking_com",
    stepOrder: 5,
    caption: "Επιλογή τύπου σύνδεσης Rates & Availability",
    altText: "Placeholder για τύπο σύνδεσης Rates and Availability",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-06",
    provider: "booking_com",
    stepOrder: 6,
    caption: "Talos — αντιστοίχιση καταλύματος Booking.com",
    altText: "Placeholder για οθόνη αντιστοίχισης καταλύματος Talos",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-07",
    provider: "booking_com",
    stepOrder: 7,
    caption: "Talos — αντιστοίχιση δωματίων",
    altText: "Placeholder για οθόνη αντιστοίχισης δωματίων Talos",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-08",
    provider: "booking_com",
    stepOrder: 8,
    caption: "Talos — αντιστοίχιση τιμοκαταλόγων",
    altText: "Placeholder για οθόνη αντιστοίχισης τιμών Talos",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-09",
    provider: "booking_com",
    stepOrder: 9,
    caption: "Talos — αποτελέσματα επικύρωσης αντιστοιχίσεων",
    altText: "Placeholder για οθόνη αποτελεσμάτων επικύρωσης Talos",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-10",
    provider: "booking_com",
    stepOrder: 10,
    caption: "Talos — προεπισκόπηση αρχικού συγχρονισμού",
    altText: "Placeholder για προεπισκόπηση αρχικού sync",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-11",
    provider: "booking_com",
    stepOrder: 11,
    caption: "Talos — επιβεβαίωση συγχρονισμού",
    altText: "Placeholder για επιβεβαίωση sync",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-12",
    provider: "booking_com",
    stepOrder: 12,
    caption: "Talos — πίνακας υγείας σύνδεσης",
    altText: "Placeholder για πίνακα υγείας Booking.com",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-13",
    provider: "booking_com",
    stepOrder: 13,
    caption: "Talos — παύση ή αποσύνδεση",
    altText: "Placeholder για έλεγχους παύσης και αποσύνδεσης",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-14",
    provider: "booking_com",
    stepOrder: 14,
    caption: "Αντιμετώπιση προβλημάτων — κατάσταση «χρειάζεται προσοχή»",
    altText: "Placeholder για κατάσταση προσοχής σύνδεσης",
    imageSrc: null,
  },
] as const;

export interface BookingComHelpSection {
  id: string;
  title: string;
  body: string[];
  screenshotIds?: string[];
}

export const BOOKING_COM_HELP_SECTIONS: readonly BookingComHelpSection[] = [
  {
    id: "what-it-does",
    title: "1. Τι κάνει η ενσωμάτωση Booking.com",
    body: [
      "Το Talos συνδέει το κατάλυμά σας με το Booking.com Connectivity ώστε οι κρατήσεις να εισέρχονται στο Talos και η διαθεσιμότητα, οι Standard τιμές και οι περιορισμοί να συγχρονίζονται από το Talos προς το Booking.com.",
      "Το Talos δεν εισάγει τις τιμές του Booking.com στους τιμοκαταλόγους Talos.",
    ],
  },
  {
    id: "before-you-start",
    title: "2. Πριν ξεκινήσετε",
    body: [
      "Χρειάζεστε ενεργό κατάλυμα Talos με δωμάτια (μονάδες) και Standard τιμοκαταλόγους.",
      "Χρειάζεστε πρόσβαση στο Booking.com Extranet για το ξενοδοχείο που θέλετε να συνδέσετε.",
      "Η live ενεργοποίηση συνεργάτη Booking.com μπορεί να είναι ακόμα εκκρεμής — το Talos το εμφανίζει ξεκάθαρα μέχρι να είναι έτοιμη η πρόσβαση.",
    ],
    screenshotIds: ["BOOKING-HELP-01"],
  },
  {
    id: "connect-in-booking",
    title: "3. Σύνδεση Talos στο Booking.com",
    body: [
      "Στο Booking.com Extranet: Account → Channel Manager.",
      "Ζητήστε ή επιλέξτε Talos και ενεργοποιήστε Reservations και Rates & Availability.",
      "Μέχρι το Talos να εμφανίζεται ως Booking.com Connectivity Partner για τον λογαριασμό σας, δεν μπορεί να ολοκληρωθεί live εξουσιοδότηση.",
    ],
    screenshotIds: [
      "BOOKING-HELP-02",
      "BOOKING-HELP-03",
      "BOOKING-HELP-04",
      "BOOKING-HELP-05",
    ],
  },
  {
    id: "match-property",
    title: "4. Αντιστοίχιση καταλύματος",
    body: [
      "Επιλέξτε κατάλυμα Talos και αντιστοιχίστε το με ξενοδοχείο Booking.com (hotel ID).",
      "Ένα ξενοδοχείο Booking.com αντιστοιχεί σε μία σύνδεση καναλιού Talos στην V1.",
    ],
    screenshotIds: ["BOOKING-HELP-06"],
  },
  {
    id: "map-rooms",
    title: "5. Αντιστοίχιση δωματίων",
    body: [
      "Αντιστοιχίστε κάθε δωμάτιο Talos με ακριβώς έναν τύπο δωματίου Booking.com.",
      "Αμφίσημες ή διπλές αντιστοιχίσεις μπλοκάρουν την ενεργοποίηση.",
    ],
    screenshotIds: ["BOOKING-HELP-07"],
  },
  {
    id: "map-rates",
    title: "6. Αντιστοίχιση τιμοκαταλόγων",
    body: [
      "Αντιστοιχίστε τιμοκαταλόγους Talos με τιμοκαταλόγους και roomrates Booking.com.",
      "Η V1 υποστηρίζει μόνο μοντέλο Standard τιμολόγησης.",
    ],
    screenshotIds: ["BOOKING-HELP-08"],
  },
  {
    id: "review-sync",
    title: "7. Έλεγχος συγχρονισμού",
    body: [
      "Επικυρώστε τις αντιστοιχίσεις και ελέγξτε την προεπισκόπηση αρχικού sync.",
      "Το Talos γίνεται πηγή για διαθεσιμότητα, τιμές και περιορισμούς. Οι κρατήσεις συνεχίζουν να εισέρχονται από το Booking.com στο Talos.",
    ],
    screenshotIds: ["BOOKING-HELP-09", "BOOKING-HELP-10"],
  },
  {
    id: "activate",
    title: "8. Ενεργοποίηση σύνδεσης",
    body: [
      "Επιβεβαιώστε την προεπισκόπηση με το token επιβεβαίωσης. Αν κάτι άλλαξε, το Talos ζητά νέα προεπισκόπηση.",
      "Η ενεργοποίηση μπλοκάρεται μέχρι να είναι έτοιμες οι αντιστοιχίσεις και το επιβεβαιωμένο αρχικό sync.",
    ],
    screenshotIds: ["BOOKING-HELP-11"],
  },
  {
    id: "health",
    title: "9. Έλεγχος υγείας σύνδεσης",
    body: [
      "Μετά την ενεργοποίηση, ο πίνακας Booking.com δείχνει υγεία κρατήσεων, ARI push, αντιστοιχίσεις και θέματα που χρειάζονται προσοχή.",
    ],
    screenshotIds: ["BOOKING-HELP-12"],
  },
  {
    id: "troubleshooting",
    title: "10. Αντιμετώπιση προβλημάτων",
    body: [
      "Αν ένα δωμάτιο δεν είναι πλέον αντιστοιχισμένο, διορθώστε την αντιστοίχιση πριν συνεχίσετε το sync.",
      "Αν αποτύχει sync διαθεσιμότητας, το Talos ξαναπροσπαθεί αυτόματα — ελέγξτε Θέματα για οδηγίες.",
      "Αν το Booking.com δεν είναι προσβάσιμο, περιμένετε και δοκιμάστε ξανά· δεν εμφανίζονται διαπιστευτήρια στο UI.",
    ],
    screenshotIds: ["BOOKING-HELP-14"],
  },
  {
    id: "pause-disconnect",
    title: "11. Παύση / επανασύνδεση / αποσύνδεση",
    body: [
      "Η παύση σταματά τον εξερχόμενο sync διατηρώντας το ιστορικό.",
      "Η αποσύνδεση τερματίζει τη live σύνδεση χωρίς να διαγράφει ιστορικό κρατήσεων, συνδέσεις κρατήσεων ή audit.",
    ],
    screenshotIds: ["BOOKING-HELP-13"],
  },
  {
    id: "faq",
    title: "12. Συχνές ερωτήσεις",
    body: [
      "Αντικαθιστά το Talos τις τιμές Booking.com στο πρώτο sync; Μόνο αφού ελέγξετε και επιβεβαιώσετε την προεπισκόπηση.",
      "Μπορώ να αντιστοιχίσω OBP/LOS; Όχι στην V1 — μόνο Standard.",
      "Θα εμφανιστούν Airbnb ή Expedia εδώ; Οι κάρτες παρόχων μπορεί να τα δείχνουν ως σύντομα· τα backends δεν έχουν υλοποιηθεί ακόμα.",
    ],
  },
] as const;
