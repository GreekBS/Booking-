import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchBookingsUseCase } from "../../src/commerce/application/BookingQueryUseCases";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";
import { ForbiddenError } from "../../src/shared/errors/DomainError";
import type {
  BookingSearchFilters,
  PaginatedBookings,
} from "../../src/commerce/ports/CommercePorts";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP_A = "44444444-4444-4444-8444-444444444444";
const PROP_B = "55555555-5555-4555-8555-555555555555";

const emptyPage: PaginatedBookings = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
};

function baseFilters(
  overrides: Partial<Omit<BookingSearchFilters, "allowedPropertyIds">> = {},
): Omit<BookingSearchFilters, "allowedPropertyIds"> {
  return {
    tenantId: TENANT_ID,
    page: 1,
    limit: 20,
    sortBy: "checkIn",
    sortDir: "asc",
    ...overrides,
  };
}

describe("SearchBookingsUseCase", () => {
  const permissionChecker = new PermissionChecker();
  const search = vi.fn();

  const bookingRepository = { search };

  const useCase = new SearchBookingsUseCase(
    bookingRepository as never,
    permissionChecker,
  );

  const superAdminActor: ActorContext = {
    userId: "sa-1",
    role: "super_admin",
    propertyIds: null,
    isSuperAdmin: true,
  };

  const adminActor: ActorContext = {
    userId: "admin-1",
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };

  const managerActor: ActorContext = {
    userId: "manager-1",
    role: "manager",
    propertyIds: [PROP_A, PROP_B],
    isSuperAdmin: false,
  };

  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue(emptyPage);
  });

  it("Super Admin with propertyId → success, allowedPropertyIds null, propertyId forwarded", async () => {
    const result = await useCase.execute(
      baseFilters({ propertyId: PROP_A }),
      superAdminActor,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(emptyPage);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        propertyId: PROP_A,
        allowedPropertyIds: null,
      }),
    );
  });

  it("tenant-wide admin without propertyId → success, allowedPropertyIds null", async () => {
    const result = await useCase.execute(baseFilters(), adminActor);

    expect(result.isSuccess).toBe(true);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        allowedPropertyIds: null,
      }),
    );
    expect(search.mock.calls[0]![0].propertyId).toBeUndefined();
  });

  it("manager with propertyId in assignment → success with allowedPropertyIds = actor.propertyIds", async () => {
    const result = await useCase.execute(
      baseFilters({ propertyId: PROP_A }),
      managerActor,
    );

    expect(result.isSuccess).toBe(true);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: PROP_A,
        allowedPropertyIds: [PROP_A, PROP_B],
      }),
    );
  });

  it("manager with propertyId outside assignment → Forbidden, search NOT called", async () => {
    const result = await useCase.execute(
      baseFilters({ propertyId: "99999999-9999-4999-8999-999999999999" }),
      managerActor,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(search).not.toHaveBeenCalled();
  });

  it("manager without propertyId → success with actor.propertyIds", async () => {
    const result = await useCase.execute(baseFilters(), managerActor);

    expect(result.isSuccess).toBe(true);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedPropertyIds: [PROP_A, PROP_B],
      }),
    );
  });

  it("actor with no booking read → Forbidden", async () => {
    const noBookingRead: ActorContext = {
      userId: "nobody",
      role: "viewer" as "admin",
      propertyIds: null,
      isSuperAdmin: false,
    };

    const result = await useCase.execute(baseFilters(), noBookingRead);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(search).not.toHaveBeenCalled();
  });
});
