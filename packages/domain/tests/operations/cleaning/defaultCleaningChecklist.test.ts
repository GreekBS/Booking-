import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLEANING_CHECKLIST_ITEMS,
  DEFAULT_CLEANING_CHECKLIST_MINIMUM_PHOTOS,
  DEFAULT_CLEANING_CHECKLIST_NAME,
  buildDefaultCleaningChecklistItems,
} from "../../../src/operations/cleaning/domain/defaultCleaningChecklist";

describe("default cleaning checklist catalog", () => {
  it("exposes exactly 10 Greek tasks in product order", () => {
    expect(DEFAULT_CLEANING_CHECKLIST_ITEMS).toHaveLength(10);
    expect(DEFAULT_CLEANING_CHECKLIST_NAME).toBe("Πρότυπη λίστα καθαρισμού");
    expect(DEFAULT_CLEANING_CHECKLIST_MINIMUM_PHOTOS).toBe(0);

    const labels = DEFAULT_CLEANING_CHECKLIST_ITEMS.map((item) => item.label);
    expect(labels).toEqual([
      "Προετοιμασία υπνοδωματίου",
      "Καθαρισμός μπάνιου",
      "Καθαρισμός κουζίνας",
      "Καθαρισμός σαλονιού και κοινόχρηστων χώρων",
      "Καθαρισμός δαπέδων",
      "Αναπλήρωση παροχών",
      "Έλεγχος εξωτερικών χώρων",
      "Έλεγχος εξοπλισμού και λειτουργιών",
      "Έλεγχος για ξεχασμένα αντικείμενα ή ζημιές",
      "Τελικός έλεγχος καταλύματος",
    ]);
  });

  it("sets required and photoRequired flags correctly", () => {
    const byLabel = Object.fromEntries(
      DEFAULT_CLEANING_CHECKLIST_ITEMS.map((item) => [item.label, item]),
    );

    expect(byLabel["Προετοιμασία υπνοδωματίου"]).toMatchObject({
      required: true,
      photoRequired: true,
    });
    expect(byLabel["Καθαρισμός μπάνιου"]).toMatchObject({
      required: true,
      photoRequired: true,
    });
    expect(byLabel["Καθαρισμός κουζίνας"]).toMatchObject({
      required: true,
      photoRequired: false,
    });
    expect(byLabel["Έλεγχος εξωτερικών χώρων"]).toMatchObject({
      required: false,
      photoRequired: false,
    });
    expect(byLabel["Τελικός έλεγχος καταλύματος"]).toMatchObject({
      required: true,
      photoRequired: true,
    });

    const photoRequiredCount = DEFAULT_CLEANING_CHECKLIST_ITEMS.filter(
      (item) => item.photoRequired,
    ).length;
    expect(photoRequiredCount).toBe(3);
  });

  it("includes non-empty Greek descriptions for every task", () => {
    for (const item of DEFAULT_CLEANING_CHECKLIST_ITEMS) {
      expect(item.description.trim().length).toBeGreaterThan(40);
      expect(item.description).toMatch(/[Α-ωά-ώ]/);
    }
  });

  it("buildDefaultCleaningChecklistItems returns editable upsert payloads", () => {
    const items = buildDefaultCleaningChecklistItems();
    expect(items).toHaveLength(10);
    expect(items[0]).toEqual({
      label: "Προετοιμασία υπνοδωματίου",
      description: DEFAULT_CLEANING_CHECKLIST_ITEMS[0]!.description,
      required: true,
      photoRequired: true,
    });
    // Mutation of the built payload must not mutate the catalog constant.
    items[0]!.label = "changed";
    expect(DEFAULT_CLEANING_CHECKLIST_ITEMS[0]!.label).toBe(
      "Προετοιμασία υπνοδωματίου",
    );
  });
});
