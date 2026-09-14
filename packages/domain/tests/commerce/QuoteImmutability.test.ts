import { describe, it, expect } from "vitest";
import { Quote } from "../../src/commerce/booking/domain/Quote";
import { QuoteSnapshot } from "../../src/commerce/booking/domain/QuoteSnapshot";
import {
  createHoldForUnit,
  createQuoteForHold,
  highSeasonRatePlan,
  villaProperty,
  HOLD_CREATED_AT,
} from "./fixtures/commerceFixtures";

describe("Quote immutability", () => {
  it("freezes snapshot line items at creation", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = createQuoteForHold(hold, highSeasonRatePlan);
    const snapshot = quote.snapshot;

    expect(() => {
      (snapshot.lineItems as { date: string }[])[0].date = "2025-01-01";
    }).toThrow();

    expect(snapshot.lineItems[0].date).toBe("2025-08-01");
  });

  it("produces independent snapshots on reconstitute", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const original = createQuoteForHold(hold);
    const json = original.snapshot.toJSON();
    json.totalAmount = "999.9999";

    const reloaded = Quote.reconstitute({
      id: original.id,
      tenantId: original.tenantId,
      holdId: original.holdId,
      unitId: original.unitId,
      propertyId: original.propertyId,
      snapshotId: original.snapshotId,
      snapshot: QuoteSnapshot.create(json),
      expiresAt: original.expiresAt,
      createdAt: original.createdAt,
    });

    expect(original.snapshot.totalAmount).not.toBe("999.9999");
    expect(reloaded.snapshot.totalAmount).toBe("999.9999");
  });

  it("has no repricing or update methods on Quote aggregate", () => {
    expect((Quote as unknown as { prototype: Record<string, unknown> }).prototype.update).toBeUndefined();
    expect((Quote as unknown as { prototype: Record<string, unknown> }).prototype.reprice).toBeUndefined();
    expect(typeof Quote.create).toBe("function");
    expect(typeof Quote.reconstitute).toBe("function");
  });

  it("expires with hold expiry boundary", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
      { now: HOLD_CREATED_AT },
    );
    const quote = createQuoteForHold(hold);
    expect(quote.isExpired(new Date(HOLD_CREATED_AT.getTime() + 16 * 60_000))).toBe(true);
  });
});
