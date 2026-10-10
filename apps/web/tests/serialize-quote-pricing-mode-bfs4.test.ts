import { describe, expect, it, vi } from "vitest";
import { QuoteSnapshot } from "@hcp/domain";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/di/container", () => ({
  userRepository: { findById: vi.fn() },
  resolveTenantContextUseCase: { execute: vi.fn() },
}));

import { serializeQuote } from "@/lib/tenant-context";

const TENANT = "11111111-1111-4111-8111-111111111111";
const HOLD = "22222222-2222-4222-8222-222222222222";
const UNIT = "33333333-3333-4333-8333-333333333333";
const PROP = "44444444-4444-4444-8444-444444444444";
const QUOTE = "55555555-5555-4555-8555-555555555555";
const SNAP = "66666666-6666-4666-8666-666666666666";

function baseSnapshot(
  pricingMode?: "talos_calculated" | "imported_csv" | "operator_entered",
) {
  return QuoteSnapshot.create({
    version: 2,
    checkIn: "2026-08-01",
    checkOut: "2026-08-04",
    propertyTimezone: "Europe/Athens",
    currency: "EUR",
    lineItems: [
      {
        date: "2026-08-01",
        baseAmount: "100.0000",
        adjustedAmount: "100.0000",
        currency: "EUR",
      },
    ],
    subtotalAmount: "300.0000",
    feesAmount: "0.0000",
    taxesAmount: "0.0000",
    totalAmount: "300.0000",
    quotedAt: new Date("2026-01-01T12:00:00.000Z"),
    ...(pricingMode ? { pricingMode } : {}),
  });
}

function asSerializeInput(snapshot: QuoteSnapshot) {
  return {
    id: QUOTE,
    tenantId: TENANT,
    holdId: HOLD,
    unitId: UNIT,
    propertyId: PROP,
    snapshotId: SNAP,
    snapshot,
    expiresAt: new Date("2026-01-02T12:00:00.000Z"),
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
  };
}

describe("BFS-4 serializeQuote pricingMode", () => {
  it("exposes stored talos_calculated", () => {
    const json = serializeQuote(asSerializeInput(baseSnapshot("talos_calculated")));
    expect(json.pricingMode).toBe("talos_calculated");
    expect(json.totalAmount).toBe("300.0000");
  });

  it("exposes imported_csv and operator_entered without conversion", () => {
    expect(
      serializeQuote(asSerializeInput(baseSnapshot("imported_csv"))).pricingMode,
    ).toBe("imported_csv");
    expect(
      serializeQuote(asSerializeInput(baseSnapshot("operator_entered")))
        .pricingMode,
    ).toBe("operator_entered");
  });

  it("returns null for legacy snapshots that omitted pricingMode", () => {
    const legacy = baseSnapshot();
    expect(legacy.storedPricingMode).toBeNull();
    // Domain readers still default for internal pricing logic.
    expect(legacy.pricingMode).toBe("talos_calculated");
    const json = serializeQuote(asSerializeInput(legacy));
    expect(json.pricingMode).toBeNull();
  });
});
