import type { UpsertChecklistTemplateItemInput } from "./CleaningTypes";

/**
 * Built-in Property checklist seed (ADR-030).
 *
 * Materialized once per Property when no ACTIVE template exists.
 * After that the operator owns the checklist — edits are never overwritten
 * and deleted defaults are never restored.
 */
export const DEFAULT_CLEANING_CHECKLIST_NAME = "Πρότυπη λίστα καθαρισμού";

/** Global photo floor; per-item `photoRequired` remains the primary gate. */
export const DEFAULT_CLEANING_CHECKLIST_MINIMUM_PHOTOS = 0;

export const DEFAULT_CLEANING_CHECKLIST_ITEMS: ReadonlyArray<
  Required<
    Pick<
      UpsertChecklistTemplateItemInput,
      "label" | "description" | "required" | "photoRequired"
    >
  >
> = [
  {
    label: "Προετοιμασία υπνοδωματίου",
    description:
      "Άλλαξε σεντόνια και μαξιλαροθήκες, στρώσε το κρεβάτι, ξεσκόνισε κομοδίνα και επιφάνειες, καθάρισε καθρέφτες, έλεγξε ντουλάπες και συρτάρια για αντικείμενα προηγούμενων επισκεπτών και καθάρισε το δάπεδο.",
    required: true,
    photoRequired: true,
  },
  {
    label: "Καθαρισμός μπάνιου",
    description:
      "Καθάρισε και απολύμανε λεκάνη, νιπτήρα και ντουζιέρα ή μπανιέρα. Καθάρισε καθρέφτη και βρύσες, τοποθέτησε καθαρές πετσέτες και πατάκι μπάνιου, αναπλήρωσε χαρτί υγείας και τις προβλεπόμενες παροχές και άδειασε τον κάδο.",
    required: true,
    photoRequired: true,
  },
  {
    label: "Καθαρισμός κουζίνας",
    description:
      "Καθάρισε πάγκο, νεροχύτη και εστίες, έλεγξε και καθάρισε το ψυγείο όπου χρειάζεται, έλεγξε σκεύη, ποτήρια και πιάτα, καθάρισε το τραπέζι, άδειασε τον κάδο και αναπλήρωσε τις προβλεπόμενες παροχές.",
    required: true,
    photoRequired: false,
  },
  {
    label: "Καθαρισμός σαλονιού και κοινόχρηστων χώρων",
    description:
      "Ξεσκόνισε και καθάρισε τραπέζια και επιφάνειες, τακτοποίησε καναπέδες και μαξιλάρια, καθάρισε καθρέφτες και γυάλινες επιφάνειες και καθάρισε το δάπεδο.",
    required: true,
    photoRequired: false,
  },
  {
    label: "Καθαρισμός δαπέδων",
    description:
      "Σκούπισε ή καθάρισε με ηλεκτρική σκούπα όλους τους εσωτερικούς χώρους και σφουγγάρισε όπου απαιτείται. Έλεγξε ιδιαίτερα γωνίες, κάτω από έπιπλα και σημεία με εμφανείς λεκέδες.",
    required: true,
    photoRequired: false,
  },
  {
    label: "Αναπλήρωση παροχών",
    description:
      "Έλεγξε και αναπλήρωσε τις παροχές που προβλέπει το κατάλυμα, όπως χαρτί υγείας, σαπούνι, σαμπουάν, νερό, καφέ ή άλλα είδη φιλοξενίας.",
    required: true,
    photoRequired: false,
  },
  {
    label: "Έλεγχος εξωτερικών χώρων",
    description:
      "Τακτοποίησε έπιπλα εξωτερικού χώρου και ξαπλώστρες, καθάρισε τραπέζια και επιφάνειες, έλεγξε τους εξωτερικούς κάδους και κάνε οπτικό έλεγχο της πισίνας και του περιβάλλοντος χώρου.",
    required: false,
    photoRequired: false,
  },
  {
    label: "Έλεγχος εξοπλισμού και λειτουργιών",
    description:
      "Κάνε έναν βασικό οπτικό έλεγχο ότι φωτισμός, κλιματισμός, τηλεόραση και βασικός εξοπλισμός φαίνονται λειτουργικά. Αν εντοπίσεις πρόβλημα, μην επιχειρήσεις τεχνική επισκευή· ενημέρωσε τον υπεύθυνο.",
    required: true,
    photoRequired: false,
  },
  {
    label: "Έλεγχος για ξεχασμένα αντικείμενα ή ζημιές",
    description:
      "Έλεγξε το κατάλυμα για αντικείμενα που άφησαν προηγούμενοι επισκέπτες και για εμφανείς ζημιές, λεκέδες ή προβλήματα που πρέπει να γνωρίζει ο υπεύθυνος.",
    required: true,
    photoRequired: false,
  },
  {
    label: "Τελικός έλεγχος καταλύματος",
    description:
      "Βεβαιώσου ότι όλοι οι χώροι είναι καθαροί και τακτοποιημένοι, όλοι οι κάδοι έχουν αδειάσει, δεν έχουν μείνει καθαριστικά ή εργαλεία στον χώρο, οι παροχές είναι στη θέση τους και το κατάλυμα είναι έτοιμο να υποδεχθεί τον επόμενο επισκέπτη.",
    required: true,
    photoRequired: true,
  },
] as const;

export function buildDefaultCleaningChecklistItems(): UpsertChecklistTemplateItemInput[] {
  return DEFAULT_CLEANING_CHECKLIST_ITEMS.map((item) => ({
    label: item.label,
    description: item.description,
    required: item.required,
    photoRequired: item.photoRequired,
  }));
}
