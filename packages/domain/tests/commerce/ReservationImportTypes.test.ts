import { describe, expect, it } from "vitest";
import {
  canResumeReservationImportDraft,
  computeReservationImportDraftExpiresAt,
  isReservationImportDraftExpired,
  RESERVATION_IMPORT_DRAFT_TTL_MS,
} from "../../src/commerce/import/ReservationImportTypes";

describe("ReservationImportTypes draft TTL", () => {
  it("computes expiresAt exactly 7 hours after createdAt", () => {
    const createdAt = new Date("2026-10-03T10:00:00.000Z");
    const expiresAt = computeReservationImportDraftExpiresAt(createdAt);
    expect(expiresAt.getTime() - createdAt.getTime()).toBe(RESERVATION_IMPORT_DRAFT_TTL_MS);
    expect(RESERVATION_IMPORT_DRAFT_TTL_MS).toBe(7 * 60 * 60 * 1000);
  });

  it("treats draft as expired at expiresAt boundary", () => {
    const createdAt = new Date("2026-10-03T10:00:00.000Z");
    const expiresAt = computeReservationImportDraftExpiresAt(createdAt);
    const batch = { status: "draft" as const, expiresAt };
    expect(isReservationImportDraftExpired(batch, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isReservationImportDraftExpired(batch, expiresAt)).toBe(true);
    expect(canResumeReservationImportDraft(batch, new Date(expiresAt.getTime() - 1))).toBe(true);
    expect(canResumeReservationImportDraft(batch, expiresAt)).toBe(false);
  });

  it("does not expire completed batches by TTL", () => {
    const expiresAt = new Date("2020-01-01T00:00:00.000Z");
    expect(
      isReservationImportDraftExpired(
        { status: "completed", expiresAt },
        new Date("2026-10-03T00:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
