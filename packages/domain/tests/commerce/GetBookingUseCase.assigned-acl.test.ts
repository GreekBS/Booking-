import { describe, expect, it } from "vitest";
import { GetBookingUseCase } from "../../src/commerce/application/CommerceUseCases";
import { ForbiddenError } from "../../src/shared/errors/DomainError";
import {
  PermissionChecker,
  type ActorContext,
} from "../../src/shared/services/PermissionChecker";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP_ASSIGNED = "22222222-2222-4222-8222-222222222222";
const PROP_UNASSIGNED = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

function bookingAt(id: string, propertyId: string) {
  return { id, tenantId: TENANT, propertyId, status: "confirmed" };
}

function setup() {
  const bookings = new Map([
    ["b-assigned", bookingAt("b-assigned", PROP_ASSIGNED)],
    ["b-unassigned", bookingAt("b-unassigned", PROP_UNASSIGNED)],
  ]);
  const repo = {
    findById: async (id: string, tenantId: string) =>
      tenantId === TENANT ? (bookings.get(id) ?? null) : null,
  };
  return new GetBookingUseCase(repo as never, new PermissionChecker());
}

describe("GetBookingUseCase — assigned-property ACL", () => {
  const manager: ActorContext = {
    userId: USER,
    role: "manager",
    propertyIds: [PROP_ASSIGNED],
  };

  it("manager can read a booking on an assigned property", async () => {
    const result = await setup().execute(TENANT, "b-assigned", manager);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().id).toBe("b-assigned");
  });

  it("manager cannot read a booking on an unassigned property", async () => {
    const result = await setup().execute(TENANT, "b-unassigned", manager);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("manager with no assigned properties cannot read any booking", async () => {
    const result = await setup().execute(TENANT, "b-assigned", {
      ...manager,
      propertyIds: [],
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("tenant-wide admin can read bookings on any property", async () => {
    const admin: ActorContext = { userId: USER, role: "admin", propertyIds: null };
    const result = await setup().execute(TENANT, "b-unassigned", admin);
    expect(result.isSuccess).toBe(true);
  });

  it("unknown booking id fails without leaking another tenant's data", async () => {
    const result = await setup().execute(TENANT, "does-not-exist", manager);
    expect(result.isFailure).toBe(true);
  });
});
