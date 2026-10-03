import { describe, expect, it } from "vitest";
import {
  canResumeReservationImportDraft,
  computeReservationImportDraftExpiresAt,
  isReservationImportDraftExpired,
  RESERVATION_IMPORT_DRAFT_TTL_HOURS,
  RESERVATION_IMPORT_DRAFT_TTL_MS,
} from "../../src/commerce/import/ReservationImportTypes";

describe("ReservationImportTypes draft TTL", () => {
  it("computes expiresAt exactly 72 hours after createdAt", () => {
    const createdAt = new Date("2026-10-03T10:00:00.000Z");
    const expiresAt = computeReservationImportDraftExpiresAt(createdAt);
    expect(expiresAt.getTime() - createdAt.getTime()).toBe(RESERVATION_IMPORT_DRAFT_TTL_MS);
    expect(RESERVATION_IMPORT_DRAFT_TTL_HOURS).toBe(72);
    expect(RESERVATION_IMPORT_DRAFT_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });

  it("remains usable at createdAt + 71h 59m 59s", () => {
    const createdAt = new Date("2026-10-03T10:00:00.000Z");
    const expiresAt = computeReservationImportDraftExpiresAt(createdAt);
    const justBefore = new Date(createdAt.getTime() + RESERVATION_IMPORT_DRAFT_TTL_MS - 1000);
    const batch = { status: "draft" as const, expiresAt };
    expect(justBefore.getTime()).toBeLessThan(expiresAt.getTime());
    expect(isReservationImportDraftExpired(batch, justBefore)).toBe(false);
    expect(canResumeReservationImportDraft(batch, justBefore)).toBe(true);
  });

  it("treats draft as expired at exact expiresAt boundary (createdAt + 72h)", () => {
    const createdAt = new Date("2026-10-03T10:00:00.000Z");
    const expiresAt = computeReservationImportDraftExpiresAt(createdAt);
    const batch = { status: "draft" as const, expiresAt };
    expect(isReservationImportDraftExpired(batch, expiresAt)).toBe(true);
    expect(canResumeReservationImportDraft(batch, expiresAt)).toBe(false);
  });

  it("treats draft as expired after createdAt + 72h + 1s", () => {
    const createdAt = new Date("2026-10-03T10:00:00.000Z");
    const expiresAt = computeReservationImportDraftExpiresAt(createdAt);
    const after = new Date(expiresAt.getTime() + 1000);
    const batch = { status: "draft" as const, expiresAt };
    expect(isReservationImportDraftExpired(batch, after)).toBe(true);
    expect(canResumeReservationImportDraft(batch, after)).toBe(false);
  });

  it("logical expiry does not require worker physical cleanup (status still draft)", () => {
    const createdAt = new Date("2026-10-03T10:00:00.000Z");
    const expiresAt = computeReservationImportDraftExpiresAt(createdAt);
    // Rows not yet cleaned — status remains draft, but logically expired.
    const batch = { status: "draft" as const, expiresAt };
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
