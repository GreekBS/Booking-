import { describe, it, expect } from "vitest";
import { Payment, isSettleable, assertCompatibleCurrency } from "../../src/billing/payments/Payment";
import { PaymentAllocation } from "../../src/billing/payments/PaymentAllocation";
import { PaymentAllocationReversal } from "../../src/billing/payments/PaymentAllocationReversal";
import { Refund } from "../../src/billing/payments/Refund";
import {
  computePaymentAvailability,
  assertCanAllocatePayment,
  assertCanRefund,
  assertCanReverse,
  computeFolioSettlement,
} from "../../src/billing/payments/Settlement";
import {
  paymentEventDeliveryKey,
  PaymentRecorded,
  PaymentSucceeded,
} from "../../src/billing/payments/events/PaymentEvents";
import { Folio, FolioLine } from "../../src/billing/domain/Folio";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { ValidationError } from "../../src/shared/errors/DomainError";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PAYMENT_ID = "22222222-2222-4222-8222-222222222222";
const SUCCEEDED_EVT = "33333333-3333-4333-8333-333333333333";

describe("Payment aggregate (F4)", () => {
  it("requires positive amount and normalizes currency", () => {
    const p = Payment.create({
      id: PAYMENT_ID,
      tenantId: TENANT,
      currency: "eur",
      amount: Money.create("50.0000", "EUR"),
      method: "CASH",
      collectionSource: "PROPERTY",
      idempotencyKey: "key-1",
    });
    expect(p.currency).toBe("EUR");
    expect(p.status).toBe("PENDING");
    expect(() =>
      Payment.create({
        id: "p2",
        tenantId: TENANT,
        currency: "EUR",
        amount: Money.create("0.0000", "EUR"),
        method: "CASH",
        collectionSource: "PROPERTY",
        idempotencyKey: "k2",
      }),
    ).toThrow(ValidationError);
  });

  it("guards status transitions", () => {
    const p = Payment.create({
      id: PAYMENT_ID,
      tenantId: TENANT,
      currency: "EUR",
      amount: Money.create("10.0000", "EUR"),
      method: "CARD",
      collectionSource: "DIRECT",
      idempotencyKey: "k3",
    });
    p.markSucceeded(SUCCEEDED_EVT);
    expect(p.status).toBe("SUCCEEDED");
    expect(() => p.markFailed()).toThrow(ValidationError);
    expect(isSettleable(p.status)).toBe(true);
    expect(isSettleable("PENDING")).toBe(false);
  });

  it("emits delivery keys without hyphens (max 64)", () => {
    const recorded = new PaymentRecorded(PAYMENT_ID, TENANT, {});
    expect(recorded.deliveryKey).toHaveLength(64);
    expect(recorded.deliveryKey).toBe(paymentEventDeliveryKey(TENANT, PAYMENT_ID));
    const succeeded = new PaymentSucceeded(PAYMENT_ID, TENANT, {}, SUCCEEDED_EVT);
    expect(succeeded.deliveryKey).toBe(paymentEventDeliveryKey(TENANT, SUCCEEDED_EVT));
  });

  it("only SUCCEEDED payments are settleable for allocation/refund", () => {
    const pending = Payment.create({
      id: "p-pending",
      tenantId: TENANT,
      currency: "EUR",
      amount: Money.create("5.0000", "EUR"),
      method: "CASH",
      collectionSource: "PROPERTY",
      idempotencyKey: "k4",
    });
    expect(() => pending.assertSettleableForAllocation()).toThrow(ValidationError);
    assertCompatibleCurrency("EUR", "EUR");
    expect(() => assertCompatibleCurrency("EUR", "USD")).toThrow(ValidationError);
  });
});

describe("Payment allocation & reversal (F4)", () => {
  it("requires positive allocation matching payment currency", () => {
    const alloc = PaymentAllocation.create({
      id: "a1",
      tenantId: TENANT,
      paymentId: PAYMENT_ID,
      folioId: "f1",
      allocatedAmount: Money.create("25.5000", "EUR"),
      paymentCurrency: "EUR",
    });
    expect(alloc.allocatedAmount).toBe("25.5000");
    expect(() =>
      PaymentAllocation.create({
        id: "a2",
        tenantId: TENANT,
        paymentId: PAYMENT_ID,
        folioId: "f1",
        allocatedAmount: Money.create("1.0000", "USD"),
        paymentCurrency: "EUR",
      }),
    ).toThrow(ValidationError);
  });

  it("requires reason on reversal", () => {
    expect(() =>
      PaymentAllocationReversal.create({
        id: "r1",
        tenantId: TENANT,
        paymentId: PAYMENT_ID,
        allocationId: "a1",
        reversedAmount: Money.create("1.0000", "EUR"),
        allocationCurrency: "EUR",
        reason: "  ",
      }),
    ).toThrow(ValidationError);
  });
});

describe("Settlement math (F4)", () => {
  const base = {
    amount: "100.0000",
    currency: "EUR",
  };

  it("computes availability with succeeded refunds only", () => {
    const view = computePaymentAvailability({
      ...base,
      allocations: [{ amount: "40.0000", currency: "EUR" }],
      reversals: [{ amount: "10.0000", currency: "EUR" }],
      refunds: [
        { amount: "5.0000", currency: "EUR", status: "PENDING" },
        { amount: "15.0000", currency: "EUR", status: "SUCCEEDED" },
      ],
    });
    expect(view.allocatedNet).toBe("30.0000");
    expect(view.refundedEffective).toBe("15.0000");
    expect(view.availableToAllocate).toBe("55.0000");
    expect(view.refundable).toBe("85.0000");
  });

  it("asserts allocate/refund/reverse caps", () => {
    assertCanAllocatePayment("55.0000", "10.0000", "EUR");
    expect(() => assertCanAllocatePayment("55.0000", "60.0000", "EUR")).toThrow(
      ValidationError,
    );
    assertCanRefund("85.0000", "20.0000", "EUR");
    assertCanReverse(
      "40.0000",
      [{ amount: "10.0000", currency: "EUR" }],
      "25.0000",
      "EUR",
    );
    expect(() =>
      assertCanReverse(
        "40.0000",
        [{ amount: "10.0000", currency: "EUR" }],
        "35.0000",
        "EUR",
      ),
    ).toThrow(ValidationError);
  });

  it("computes folio settlement with overpayment", () => {
    const folio = computeFolioSettlement({
      folioTotal: "200.0000",
      currency: "EUR",
      allocationsToFolio: [
        { amount: "150.0000", currency: "EUR" },
        { amount: "80.0000", currency: "EUR" },
      ],
      reversalsForThoseAllocations: [{ amount: "20.0000", currency: "EUR" }],
    });
    expect(folio.netSettledAmount).toBe("210.0000");
    expect(folio.outstandingAmount).toBe("0.0000");
    expect(folio.overpaymentAmount).toBe("10.0000");
    expect(folio.paidAmountSource).toBe("allocations");
  });

  it("rejects negative availability inputs", () => {
    expect(() =>
      computePaymentAvailability({
        ...base,
        allocations: [{ amount: "10.0000", currency: "EUR" }],
        reversals: [{ amount: "20.0000", currency: "EUR" }],
        refunds: [],
      }),
    ).toThrow(ValidationError);
  });
});

describe("Folio balance with settlement input (F4)", () => {
  it("uses net settled when settlement provided", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: TENANT,
      bookingId: "b1",
      currency: "EUR",
    });
    folio.appendPostedLine(
      FolioLine.createPosted({
        id: "l1",
        tenantId: TENANT,
        folioId: "f1",
        lineType: "accommodation",
        description: "Stay",
        amount: Money.create("200.0000", "EUR"),
        source: { sourceType: "manual", sourceId: "m1", sourceLineRef: null },
        sortOrder: 1,
      }),
    );

    const f1 = folio.computeBalance();
    expect(f1.paidAmountSource).toBe("no_allocations");
    expect(f1.paidAmount).toBe("0.0000");
    expect(f1.outstandingBalance).toBe("200.0000");

    const f4 = folio.computeBalance({
      netSettledAmount: "150.0000",
      allocatedPaidAmount: "160.0000",
      refundedAmount: "10.0000",
      overpaymentAmount: "0.0000",
      paidAmountSource: "allocations",
    });
    expect(f4.paidAmount).toBe("150.0000");
    expect(f4.netSettledAmount).toBe("150.0000");
    expect(f4.outstandingBalance).toBe("50.0000");
    expect(f4.paidAmountSource).toBe("allocations");
  });
});

describe("Refund aggregate (F4)", () => {
  it("creates succeeded refund with positive amount", () => {
    const refund = Refund.create({
      id: "rf1",
      tenantId: TENANT,
      paymentId: PAYMENT_ID,
      amount: Money.create("12.0000", "EUR"),
      paymentCurrency: "EUR",
      status: "SUCCEEDED",
      idempotencyKey: "ref-k1",
    });
    expect(refund.status).toBe("SUCCEEDED");
    const events = refund.pullDomainEvents();
    expect(events.some((e) => e.eventType === "RefundSucceeded")).toBe(true);
  });
});
