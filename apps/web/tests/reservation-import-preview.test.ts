import { describe, expect, it } from "vitest";
import {
  parseAndValidateCsvImport,
  type CsvImportCanonicalField,
} from "@hcp/domain";
import { csvIssueMessageEl } from "@/features/reservation-import/csv-issue-messages";
import {
  RESERVATION_IMPORT_CHANGE_FILE_LABEL,
  RESERVATION_IMPORT_COMMIT_LABEL,
  RESERVATION_IMPORT_CONTINUE_TO_REVIEW_LABEL,
  RESERVATION_IMPORT_REVIEW_TITLE,
} from "@/features/reservation-import/reservation-import-copy";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function enc(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const EN_HEADERS =
  "reservation_id,unit_name,guest_name,guest_email,guest_phone,check_in,check_out,guest_count,total_amount,currency";

function mapAll(headers: string[]): Record<string, CsvImportCanonicalField | null> {
  const fields: CsvImportCanonicalField[] = [
    "externalReference",
    "unitRef",
    "guestName",
    "guestEmail",
    "guestPhone",
    "checkIn",
    "checkOut",
    "guestCount",
    "totalAmount",
    "currency",
  ];
  const mapping: Record<string, CsvImportCanonicalField | null> = {};
  headers.forEach((h, i) => {
    mapping[h] = fields[i] ?? null;
  });
  return mapping;
}

describe("CSV import Preview + confirmation UX", () => {
  it("landing shows Preview before draft/commit and change-file abandon", () => {
    const landing = read(
      "features/reservation-import/ReservationImportLandingPage.tsx",
    );
    const preview = read(
      "features/reservation-import/ReservationImportPreview.tsx",
    );
    expect(landing).toContain("ReservationImportPreview");
    expect(landing).toContain("3. Προεπισκόπηση");
    expect(landing).toContain("RESERVATION_IMPORT_CONTINUE_TO_REVIEW_LABEL");
    expect(landing).toContain("RESERVATION_IMPORT_CHANGE_FILE_LABEL");
    expect(landing).toContain("import-continue-to-review");
    expect(landing).toContain("import-change-file");
    expect(landing).not.toContain("RESERVATION_IMPORT_COMMIT_LABEL");
    expect(landing).not.toContain("commitReservationImportDraft");
    expect(preview).toContain('data-testid="reservation-import-preview"');
    expect(preview).toContain("κρατήσεις βρέθηκαν");
    expect(preview).toContain("Έτοιμες");
    expect(preview).toContain("Χρειάζονται προσοχή");
    expect(preview).toContain("δεν δημιουργούνται κρατήσεις ακόμη");
    expect(preview).toContain("Επισκέπτης");
    expect(preview).toContain("Άφιξη");
    expect(preview).toContain("Αναχώρηση");
    expect(preview).toContain("Δωμάτιο");
    expect(preview).toContain("Τηλέφωνο");
    expect(preview).toContain("Email");
    expect(preview).toContain("Ποσό");
    expect(preview).toContain("Αναφορά");
    expect(preview).toContain("Κατάσταση");
    expect(RESERVATION_IMPORT_CONTINUE_TO_REVIEW_LABEL).toBe(
      "Συνέχεια στην προεπισκόπηση",
    );
    expect(RESERVATION_IMPORT_CHANGE_FILE_LABEL).toBe("Αλλαγή αρχείου");
  });

  it("draft page Preview table + Εισαγωγή κρατήσεων is the only commit CTA", () => {
    const page = read(
      "features/reservation-import/ReservationImportDraftPage.tsx",
    );
    const table = read(
      "features/reservation-import/ReservationImportDraftPreviewTable.tsx",
    );
    const copy = read(
      "features/reservation-import/reservation-import-copy.ts",
    );
    const review = read(
      "features/reservation-import/useReservationImportReview.ts",
    );

    expect(copy).toContain(
      'RESERVATION_IMPORT_COMMIT_LABEL = "Εισαγωγή κρατήσεων"',
    );
    expect(RESERVATION_IMPORT_COMMIT_LABEL).toBe("Εισαγωγή κρατήσεων");
    expect(RESERVATION_IMPORT_REVIEW_TITLE).toBe("Προεπισκόπηση εισαγωγής");

    expect(page).toContain("ReservationImportDraftPreviewTable");
    expect(page).toContain("import-commit-reservations");
    expect(page).toContain("import-confirm-panel");
    expect(page).toContain("RESERVATION_IMPORT_CHANGE_FILE_LABEL");
    expect(page).toContain("RESERVATION_IMPORT_COMMIT_LABEL");
    expect(page).toContain("setCommitOpen(true)");
    expect(page).toContain("commit()");

    expect(table).toContain('data-testid="reservation-import-draft-preview"');
    expect(table).toContain("guestPhone");
    expect(table).toContain("guestEmail");
    expect(table).toContain("Εισαγωγή κρατήσεων");
    expect(table).toContain("οι κρατήσεις δημιουργούνται μόνο όταν");

    // Commit path remains the existing review hook — no alternate creator in UI table.
    expect(table).not.toContain("createBooking");
    expect(table).not.toContain("commitReservationImportDraft");
    expect(review).toContain("commitReservationImportDraft");
  });

  it("Preview parse rows expose normalized guest/dates/unit/guests/phone/email/amount", () => {
    const csv = [
      EN_HEADERS,
      "R1,Entire Property,John Smith,john@example.com,+306900000001,2027-06-10,2027-06-15,4,750,EUR",
      "R2,Room 204,Maria Brown,,+306900000002,2027-06-18,2027-06-21,2,420,EUR",
    ].join("\n");
    const headers = EN_HEADERS.split(",");
    const result = parseAndValidateCsvImport({
      content: enc(csv),
      columnMapping: mapAll(headers),
      bookableUnitCount: 1,
    });

    expect(result.rowCount).toBe(2);
    expect(result.structurallyImportableCount).toBe(2);
    expect(result.rows[0]?.guestName).toBe("John Smith");
    expect(result.rows[0]?.checkIn).toBe("2027-06-10");
    expect(result.rows[0]?.checkOut).toBe("2027-06-15");
    expect(result.rows[0]?.unitRef).toBe("Entire Property");
    expect(result.rows[0]?.guestCount).toBe(4);
    expect(result.rows[0]?.guestPhone).toBe("+306900000001");
    expect(result.rows[0]?.guestEmail).toBe("john@example.com");
    expect(result.rows[0]?.price.status).toBe("present");
    expect(result.rows[0]?.externalReference).toBe("R1");
    expect(result.rows[0]?.structurallyImportable).toBe(true);

    // Phone-only guest remains valid when email empty.
    expect(result.rows[1]?.guestEmail).toBeNull();
    expect(result.rows[1]?.guestPhone).toBe("+306900000002");
    expect(result.rows[1]?.structurallyImportable).toBe(true);
  });

  it("invalid rows surface operator-facing validation problems for Preview", () => {
    const csv = [
      EN_HEADERS,
      "R1,Unknown Room,John Smith,john@example.com,,2027-06-10,2027-06-15,2,100,EUR",
      "R2,,Maria Brown,,,2027-06-18,2027-06-21,2,100,EUR",
      "R3,Room A,Bad Dates,,,2027-06-21,2027-06-18,2,100,EUR",
    ].join("\n");
    const headers = EN_HEADERS.split(",");
    const propertyId = "11111111-1111-1111-1111-111111111111";
    const unitA = "22222222-2222-2222-2222-222222222222";

    const multi = parseAndValidateCsvImport({
      content: enc(csv),
      columnMapping: mapAll(headers),
      bookableUnitCount: 2,
      unitResolutions: new Map([
        [
          "Room A",
          { status: "resolved", unitId: unitA, propertyId },
        ],
        [
          "Unknown Room",
          { status: "not_found" },
        ],
      ]),
    });

    const unknown = multi.rows.find((r) => r.rowNumber === 1);
    expect(unknown?.structurallyImportable).toBe(false);
    expect(unknown?.errors.some((e) => e.code === "UNIT_NOT_FOUND")).toBe(true);
    expect(
      csvIssueMessageEl(unknown!.errors.find((e) => e.code === "UNIT_NOT_FOUND")!),
    ).toContain("Άγνωστο δωμάτιο");

    const missingUnit = multi.rows.find((r) => r.rowNumber === 2);
    expect(missingUnit?.structurallyImportable).toBe(false);
    expect(missingUnit?.errors.some((e) => e.code === "REQUIRED_UNIT_REF")).toBe(
      true,
    );
    expect(
      csvIssueMessageEl(missingUnit!.errors.find((e) => e.code === "REQUIRED_UNIT_REF")!),
    ).toContain("πολλές μονάδες");

    const badDates = multi.rows.find((r) => r.rowNumber === 3);
    expect(badDates?.errors.some((e) => e.code === "INVALID_STAY_PERIOD")).toBe(
      true,
    );
    expect(
      csvIssueMessageEl(badDates!.errors.find((e) => e.code === "INVALID_STAY_PERIOD")!),
    ).toMatch(/ημερομην/i);

    // Single-unit: missing unitRef auto-resolves via defaultUnitResolution.
    const soleUnit = "33333333-3333-3333-3333-333333333333";
    const single = parseAndValidateCsvImport({
      content: enc(
        [
          EN_HEADERS,
          "R9,,Solo Guest,solo@example.com,,2027-07-01,2027-07-03,2,200,EUR",
        ].join("\n"),
      ),
      columnMapping: mapAll(headers),
      bookableUnitCount: 1,
      defaultUnitResolution: {
        status: "resolved",
        unitId: soleUnit,
        propertyId,
      },
    });
    expect(single.rows[0]?.errors.some((e) => e.code === "REQUIRED_UNIT_REF")).toBe(
      false,
    );
    expect(single.rows[0]?.unitId).toBe(soleUnit);
    expect(single.rows[0]?.structurallyImportable).toBe(true);
  });

  it("Preview UI modules do not call commit or invent booking creation", () => {
    const preview = read(
      "features/reservation-import/ReservationImportPreview.tsx",
    );
    const draftPreview = read(
      "features/reservation-import/ReservationImportDraftPreviewTable.tsx",
    );
    for (const src of [preview, draftPreview]) {
      expect(src).not.toContain("commitReservationImportDraft");
      expect(src).not.toContain("/commit");
      expect(src).not.toContain("createBooking");
      expect(src).not.toContain("UnitCalendarBlock");
      expect(src).not.toContain("BookingHold");
    }
  });

  it("completed summary deep-link wiring remains on draft page", () => {
    const page = read(
      "features/reservation-import/ReservationImportDraftPage.tsx",
    );
    expect(page).toContain("RESERVATION_IMPORT_COMPLETED_TITLE");
    expect(page).toContain("collectCreatedBookingIds");
    expect(page).toContain("bookingDrawerHref");
    expect(page).toContain("RESERVATION_IMPORT_VIEW_BOOKING_LABEL");
  });
});
