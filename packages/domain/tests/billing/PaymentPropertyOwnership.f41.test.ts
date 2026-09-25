import { describe, it, expect } from "vitest";
import { Payment } from "../../src/billing/payments/Payment";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { ValidationError } from "../../src/shared/errors/DomainError";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROPERTY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROPERTY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Payment property ownership (F4.1)", () => {
  it("requires propertyId", () => {
    expect(() =>
      Payment.create({
        id: "p1",
        tenantId: TENANT,
        propertyId: "  ",
        currency: "EUR",
        amount: Money.create("10.0000", "EUR"),
        method: "CASH",
        collectionSource: "PROPERTY",
        idempotencyKey: "k1",
      }),
    ).toThrow(ValidationError);
  });

  it("persists canonical property ownership without booking", () => {
    const p = Payment.create({
      id: "p2",
      tenantId: TENANT,
      propertyId: PROPERTY,
      currency: "EUR",
      amount: Money.create("200.0000", "EUR"),
      status: "SUCCEEDED",
      method: "BANK_TRANSFER",
      collectionSource: "PROPERTY",
      idempotencyKey: "deposit-1",
    });
    expect(p.propertyId).toBe(PROPERTY);
    expect(p.bookingId).toBeNull();
  });

  it("allows bookingId with matching property owner in aggregate props", () => {
    const p = Payment.create({
      id: "p3",
      tenantId: TENANT,
      propertyId: PROPERTY,
      bookingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      currency: "EUR",
      amount: Money.create("50.0000", "EUR"),
      method: "CASH",
      collectionSource: "DIRECT",
      idempotencyKey: "k3",
    });
    expect(p.propertyId).toBe(PROPERTY);
    expect(p.bookingId).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(PROPERTY_B).not.toBe(PROPERTY);
  });
});
