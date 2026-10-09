import { describe, expect, it, vi } from "vitest";
import { ResolvePublicQrRouteUseCase } from "../../../src/operations/cleaning/application/PublicQrStaffUseCases";
import type { IOpaqueTokenFactory } from "../../../src/operations/cleaning/ports/IOpaqueTokenFactory";
import type { ICleaningLocationRepository } from "../../../src/operations/cleaning/ports/ICleaningLocationRepository";
import type {
  IPublicCleaningQrLookup,
  IPropertyStaffPinRepository,
} from "../../../src/operations/cleaning/ports/IPublicQrStaffPorts";
import type { IPropertyRepository } from "../../../src/catalog/ports/ICatalogRepositories";
import type { CleaningLocationRecord } from "../../../src/operations/cleaning/domain/CleaningLocationTypes";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROPERTY = "22222222-2222-2222-2222-222222222222";
const UNIT = "33333333-3333-3333-3333-333333333333";
const QR = "44444444-4444-4444-4444-444444444444";
const LOCATION = "55555555-5555-5555-5555-555555555555";
const TOKEN = "a".repeat(64);
const HASH = "b".repeat(64);

function locationRecord(
  overrides: Partial<CleaningLocationRecord> = {},
): CleaningLocationRecord {
  return {
    id: LOCATION,
    tenantId: TENANT,
    propertyId: PROPERTY,
    name: "Studio A",
    status: "active",
    sortOrder: 0,
    commercialUnitId: UNIT,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

describe("ResolvePublicQrRouteUseCase — unit QR without linked location", () => {
  it("ensures a linked CleaningLocation and resolves staff_pin (no duplicate when already linked)", async () => {
    const tokens: IOpaqueTokenFactory = {
      create: () => ({ token: TOKEN, tokenHash: HASH }),
      hash: () => HASH,
    };
    const lookup: IPublicCleaningQrLookup = {
      findActiveByTokenHash: vi.fn(async () => ({
        kind: "unit" as const,
        qrAccessId: QR,
        tenantId: TENANT,
        propertyId: PROPERTY,
        unitId: UNIT,
        cleaningLocationId: null,
        tokenHash: HASH,
      })),
    };
    const staffPin: IPropertyStaffPinRepository = {
      getForProperty: vi.fn(),
      getPublicMeta: vi.fn(async () => ({
        propertyId: PROPERTY,
        propertyName: "Demo Hotel",
        websiteUrl: null,
        pinConfigured: true,
        lockedUntil: null,
      })),
      setPinHash: vi.fn(),
      recordFailedAttempt: vi.fn(),
      clearFailures: vi.fn(),
    };
    const ensure = vi.fn(async () => ({
      location: locationRecord(),
      created: true,
    }));
    const locations = {
      findById: vi.fn(),
      findActiveByCommercialUnit: vi.fn(async () => null),
      ensureActiveLinkedToCommercialUnit: ensure,
    } as unknown as ICleaningLocationRepository;
    const properties = {
      findById: vi.fn(async () => ({
        id: PROPERTY,
        name: "Demo Hotel",
        units: [{ id: UNIT, name: "Studio A" }],
      })),
    } as unknown as IPropertyRepository;

    const uc = new ResolvePublicQrRouteUseCase(
      tokens,
      lookup,
      staffPin,
      locations,
      properties,
    );

    const first = await uc.execute({ token: TOKEN });
    expect(first.isSuccess).toBe(true);
    const value = first.getValue();
    expect(value.route.kind).toBe("staff_pin");
    expect(value.identity.locationId).toBe(LOCATION);
    expect(value.identity.unitId).toBe(UNIT);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        propertyId: PROPERTY,
        unitId: UNIT,
        preferredName: "Studio A",
      }),
    );

    // Second resolve: location already linked — no second create.
    (locations.findActiveByCommercialUnit as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      locationRecord(),
    );
    const second = await uc.execute({ token: TOKEN });
    expect(second.isSuccess).toBe(true);
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid token format without creating locations", async () => {
    const ensure = vi.fn();
    const uc = new ResolvePublicQrRouteUseCase(
      { create: () => ({ token: TOKEN, tokenHash: HASH }), hash: () => HASH },
      { findActiveByTokenHash: vi.fn() },
      {
        getForProperty: vi.fn(),
        getPublicMeta: vi.fn(),
        setPinHash: vi.fn(),
        recordFailedAttempt: vi.fn(),
        clearFailures: vi.fn(),
      },
      {
        findById: vi.fn(),
        findActiveByCommercialUnit: vi.fn(),
        ensureActiveLinkedToCommercialUnit: ensure,
      } as unknown as ICleaningLocationRepository,
      { findById: vi.fn() } as unknown as IPropertyRepository,
    );
    const result = await uc.execute({ token: "short" });
    expect(result.isFailure).toBe(true);
    expect(ensure).not.toHaveBeenCalled();
  });
});
