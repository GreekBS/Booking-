import { describe, expect, it } from "vitest";
import {
  BookingCommercialAmendment,
  ForbiddenError,
  ListBookingCommercialAmendmentsUseCase,
  NotFoundError,
  PermissionChecker,
  type ActorContext,
} from "../../src/index";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const PROP_ASSIGNED = "22222222-2222-4222-8222-222222222222";
const PROP_UNASSIGNED = "33333333-3333-4333-8333-333333333333";
const BOOKING = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";
const Q1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Q2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const Q3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const A1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const A2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FP = "a".repeat(64);

function amendment(input: {
  id: string;
  propertyId: string;
  previousQuoteId: string;
  newQuoteId: string;
  previousTotalAmount: string;
  newTotalAmount: string;
  reason: string;
  createdAt: Date;
  confirmationReference: string;
  idempotencyKey: string;
}) {
  return BookingCommercialAmendment.create({
    id: input.id,
    tenantId: TENANT,
    propertyId: input.propertyId,
    bookingId: BOOKING,
    previousQuoteId: input.previousQuoteId,
    newQuoteId: input.newQuoteId,
    previousTotalAmount: input.previousTotalAmount,
    newTotalAmount: input.newTotalAmount,
    currency: "EUR",
    pricingIntent: "recalculate_from_rate_plan",
    reason: input.reason,
    actorId: USER,
    mutationOrigin: "operator",
    confirmationReference: input.confirmationReference,
    idempotencyKey: input.idempotencyKey,
    pricingFingerprint: FP,
    createdAt: input.createdAt,
  });
}

function setup(opts?: {
  bookingPropertyId?: string;
  amendments?: BookingCommercialAmendment[];
}) {
  const bookingPropertyId = opts?.bookingPropertyId ?? PROP_ASSIGNED;
  const amendments = opts?.amendments ?? [];
  const bookingRepo = {
    findById: async (id: string, tenantId: string) => {
      if (tenantId !== TENANT || id !== BOOKING) return null;
      return {
        id: BOOKING,
        tenantId: TENANT,
        propertyId: bookingPropertyId,
      };
    },
  };
  const amendmentRepo = {
    listByBookingId: async (tenantId: string, bookingId: string) => {
      if (tenantId !== TENANT || bookingId !== BOOKING) return [];
      return amendments;
    },
  };
  return new ListBookingCommercialAmendmentsUseCase(
    bookingRepo as never,
    amendmentRepo as never,
    new PermissionChecker(),
  );
}

describe("BFS-4 ListBookingCommercialAmendmentsUseCase", () => {
  const manager: ActorContext = {
    userId: USER,
    role: "manager",
    propertyIds: [PROP_ASSIGNED],
  };

  const admin: ActorContext = {
    userId: USER,
    role: "admin",
    propertyIds: null,
  };

  it("returns newest-first safe fields for assigned manager", async () => {
    const older = amendment({
      id: A1,
      propertyId: PROP_ASSIGNED,
      previousQuoteId: Q1,
      newQuoteId: Q2,
      previousTotalAmount: "300.0000",
      newTotalAmount: "400.0000",
      reason: "First correction",
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
      confirmationReference: "b".repeat(64),
      idempotencyKey: "idem-older-0001",
    });
    const newer = amendment({
      id: A2,
      propertyId: PROP_ASSIGNED,
      previousQuoteId: Q2,
      newQuoteId: Q3,
      previousTotalAmount: "400.0000",
      newTotalAmount: "500.0000",
      reason: "Second correction",
      createdAt: new Date("2026-01-02T10:00:00.000Z"),
      confirmationReference: "c".repeat(64),
      idempotencyKey: "idem-newer-0001",
    });

    const result = await setup({ amendments: [older, newer] }).execute(
      TENANT,
      BOOKING,
      manager,
    );

    expect(result.isSuccess).toBe(true);
    const items = result.getValue();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(A2);
    expect(items[1].id).toBe(A1);
    expect(items[0]).toMatchObject({
      bookingId: BOOKING,
      propertyId: PROP_ASSIGNED,
      previousTotalAmount: "400.0000",
      newTotalAmount: "500.0000",
      deltaAmount: "100.0000",
      currency: "EUR",
      pricingIntent: "recalculate_from_rate_plan",
      reason: "Second correction",
      actorId: USER,
      mutationOrigin: "operator",
      createdAt: "2026-01-02T10:00:00.000Z",
    });

    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain("confirmationReference");
    expect(serialized).not.toContain("idempotencyKey");
    expect(serialized).not.toContain("pricingFingerprint");
    expect(serialized).not.toContain("b".repeat(64));
    expect(serialized).not.toContain("idem-older");
  });

  it("rejects manager for unassigned property", async () => {
    const result = await setup({ bookingPropertyId: PROP_UNASSIGNED }).execute(
      TENANT,
      BOOKING,
      manager,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("rejects actor without booking-read permission", async () => {
    const checker = {
      hasPermission: () => false,
    };
    const useCase = new ListBookingCommercialAmendmentsUseCase(
      {
        findById: async () => ({
          id: BOOKING,
          tenantId: TENANT,
          propertyId: PROP_ASSIGNED,
        }),
      } as never,
      { listByBookingId: async () => [] } as never,
      checker as never,
    );
    const result = await useCase.execute(TENANT, BOOKING, admin);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("rejects unknown booking (cross-tenant / missing)", async () => {
    const result = await setup().execute(OTHER_TENANT, BOOKING, admin);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });

  it("tenant admin can list on any property", async () => {
    const result = await setup({ bookingPropertyId: PROP_UNASSIGNED }).execute(
      TENANT,
      BOOKING,
      admin,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it("filters amendments whose propertyId diverges from booking", async () => {
    const mismatched = amendment({
      id: A1,
      propertyId: PROP_UNASSIGNED,
      previousQuoteId: Q1,
      newQuoteId: Q2,
      previousTotalAmount: "300.0000",
      newTotalAmount: "400.0000",
      reason: "Mismatched property",
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
      confirmationReference: "d".repeat(64),
      idempotencyKey: "idem-mismatch-01",
    });
    const result = await setup({
      bookingPropertyId: PROP_ASSIGNED,
      amendments: [mismatched],
    }).execute(TENANT, BOOKING, admin);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it("orders identical timestamps deterministically by id descending", async () => {
    const sameInstant = new Date("2026-01-03T10:00:00.000Z");
    const lowerId = amendment({
      id: A1,
      propertyId: PROP_ASSIGNED,
      previousQuoteId: Q1,
      newQuoteId: Q2,
      previousTotalAmount: "300.0000",
      newTotalAmount: "350.0000",
      reason: "Lower id same time",
      createdAt: sameInstant,
      confirmationReference: "e".repeat(64),
      idempotencyKey: "idem-tie-lower-01",
    });
    const higherId = amendment({
      id: A2,
      propertyId: PROP_ASSIGNED,
      previousQuoteId: Q2,
      newQuoteId: Q3,
      previousTotalAmount: "350.0000",
      newTotalAmount: "400.0000",
      reason: "Higher id same time",
      createdAt: sameInstant,
      confirmationReference: "f".repeat(64),
      idempotencyKey: "idem-tie-higher-01",
    });

    const result = await setup({
      amendments: [lowerId, higherId],
    }).execute(TENANT, BOOKING, admin);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().map((item) => item.id)).toEqual([A2, A1]);
  });
});
