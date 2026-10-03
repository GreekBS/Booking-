import { describe, expect, it } from "vitest";
import { AdminApiError } from "@/lib/admin/api";
import {
  isReservationImportExpiredError,
  isReservationImportNotFoundError,
} from "@/lib/admin/reservation-import-api";
import {
  RESERVATION_IMPORT_DISCARD_DESCRIPTION,
  RESERVATION_IMPORT_DRAFT_TTL_MESSAGE,
  RESERVATION_IMPORT_EXPIRED_MESSAGE,
} from "@/features/reservation-import/reservation-import-copy";

describe("B3.1 reservation-import helpers", () => {
  it("detects expired draft API errors", () => {
    expect(
      isReservationImportExpiredError(
        new AdminApiError("VALIDATION_ERROR", "Import draft has expired", 400),
      ),
    ).toBe(true);
    expect(
      isReservationImportExpiredError(
        new AdminApiError("VALIDATION_ERROR", "Import draft not found", 400),
      ),
    ).toBe(false);
  });

  it("detects not-found draft API errors", () => {
    expect(
      isReservationImportNotFoundError(
        new AdminApiError("VALIDATION_ERROR", "Import draft not found", 400),
      ),
    ).toBe(true);
    expect(
      isReservationImportNotFoundError(
        new AdminApiError("NOT_FOUND", "missing", 404),
      ),
    ).toBe(true);
  });

  it("keeps required Greek product copy", () => {
    expect(RESERVATION_IMPORT_DRAFT_TTL_MESSAGE).toBe(
      "Το πρόχειρο θα διατηρηθεί για 3 ημέρες.",
    );
    expect(RESERVATION_IMPORT_DISCARD_DESCRIPTION).toBe(
      "Θέλετε να απορρίψετε αυτή την πρόχειρη εισαγωγή;",
    );
    expect(RESERVATION_IMPORT_EXPIRED_MESSAGE).toContain("λήξει");
  });
});
