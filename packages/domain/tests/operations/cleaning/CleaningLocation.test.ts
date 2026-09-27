import { describe, expect, it } from "vitest";
import {
  assertBulkCleaningLocationCount,
  defaultBulkCleaningLocationName,
  normalizeCleaningLocationName,
  renameCleaningLocation,
  createCleaningLocation,
  archiveCleaningLocation,
} from "../../../src/operations/cleaning/domain/CleaningLocation";
import {
  CLEANING_LOCATION_BULK_MAX,
  CLEANING_LOCATION_BULK_MIN,
} from "../../../src/operations/cleaning/domain/CleaningLocationTypes";
import { ValidationError, ConflictError } from "../../../src/shared/errors/DomainError";

describe("CleaningLocation domain helpers", () => {
  it("normalizes names by trimming and rejecting empties", () => {
    expect(normalizeCleaningLocationName("  12  ")).toBe("12");
    expect(() => normalizeCleaningLocationName("   ")).toThrow(ValidationError);
    expect(() => normalizeCleaningLocationName("")).toThrow(ValidationError);
  });

  it("enforces bulk initialize caps", () => {
    expect(() => assertBulkCleaningLocationCount(0)).toThrow(ValidationError);
    expect(() => assertBulkCleaningLocationCount(CLEANING_LOCATION_BULK_MIN - 1)).toThrow(
      ValidationError,
    );
    expect(() => assertBulkCleaningLocationCount(CLEANING_LOCATION_BULK_MAX + 1)).toThrow(
      ValidationError,
    );
    expect(() => assertBulkCleaningLocationCount(1.5)).toThrow(ValidationError);
    expect(() => assertBulkCleaningLocationCount(10)).not.toThrow();
    expect(() => assertBulkCleaningLocationCount(CLEANING_LOCATION_BULK_MAX)).not.toThrow();
  });

  it("uses numeric string names for bulk defaults", () => {
    expect(defaultBulkCleaningLocationName(1)).toBe("1");
    expect(defaultBulkCleaningLocationName(12)).toBe("12");
    expect(() => defaultBulkCleaningLocationName(0)).toThrow(ValidationError);
  });

  it("rename keeps the same location id and rejects archived locations", () => {
    const active = createCleaningLocation({
      id: "loc-1",
      tenantId: "t1",
      propertyId: "p1",
      name: "1",
    });
    const renamed = renameCleaningLocation(active, "  Σουίτα Α  ");
    expect(renamed.id).toBe(active.id);
    expect(renamed.name).toBe("Σουίτα Α");
    expect(renamed.commercialUnitId).toBe(active.commercialUnitId);

    const archived = archiveCleaningLocation(active);
    expect(archived.id).toBe(active.id);
    expect(() => renameCleaningLocation(archived, "2")).toThrow(ConflictError);
  });

  it("archive retains identity for historical readability", () => {
    const active = createCleaningLocation({
      id: "loc-hist",
      tenantId: "t1",
      propertyId: "p1",
      name: "12",
    });
    const archived = archiveCleaningLocation(active);
    expect(archived.status).toBe("archived");
    expect(archived.id).toBe("loc-hist");
    expect(archived.name).toBe("12");
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });
});
