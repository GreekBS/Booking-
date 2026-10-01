import { describe, expect, it, vi } from "vitest";
import { PermissionChecker } from "../../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../../src/shared/services/PermissionChecker";
import { ForbiddenError, NotFoundError } from "../../../src/shared/errors/DomainError";
import {
  GetCleaningLocationQrUseCase,
  ResolveCleaningQrUseCase,
  RotateCleaningLocationQrUseCase,
  GenerateCleaningLocationQrUseCase,
} from "../../../src/operations/cleaning/application/CleaningLocationQrUseCases";
import type { CleaningLocationRecord } from "../../../src/operations/cleaning/domain/CleaningLocationTypes";
import type { CleaningLocationQrAccessRecord } from "../../../src/operations/cleaning/domain/CleaningLocationTypes";
import type { IHousekeepingQrTokenSealer } from "../../../src/operations/cleaning/ports/IHousekeepingQrTokenSealer";

const TENANT = "tenant-1";
const PROPERTY = "prop-1";
const LOCATION_ID = "loc-1";
const UNIT_ID = "unit-1";
const TOKEN =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_HASH = "hash-of-token";
const TOKEN_HASH_B = "hash-of-token-b";
const CIPHER = new Uint8Array([1, 2, 3, 4]);

const actor: ActorContext = {
  userId: "user-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: false,
};

const otherPropertyActor: ActorContext = {
  userId: "mgr-1",
  role: "manager",
  propertyIds: ["prop-other"],
  isSuperAdmin: false,
};

function makeLocation(
  overrides?: Partial<CleaningLocationRecord>,
): CleaningLocationRecord {
  const now = new Date("2026-09-28T00:00:00.000Z");
  return {
    id: LOCATION_ID,
    tenantId: TENANT,
    propertyId: PROPERTY,
    name: "1",
    status: "active",
    sortOrder: 0,
    commercialUnitId: UNIT_ID,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

function makeLocationQr(
  overrides?: Partial<CleaningLocationQrAccessRecord>,
): CleaningLocationQrAccessRecord {
  const now = new Date("2026-09-28T00:00:00.000Z");
  return {
    id: "lqr-1",
    tenantId: TENANT,
    propertyId: PROPERTY,
    cleaningLocationId: LOCATION_ID,
    tokenHash: TOKEN_HASH,
    tokenCiphertext: CIPHER,
    tokenKeyVersion: 1,
    status: "ACTIVE",
    createdAt: now,
    rotatedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function makeSealer(
  map: Record<string, string> = { "1,2,3,4": TOKEN },
): IHousekeepingQrTokenSealer {
  return {
    seal: vi.fn((token: string) => ({
      ciphertext: new Uint8Array(
        token === TOKEN_B ? [9, 9, 9, 9] : [1, 2, 3, 4],
      ),
      keyVersion: 1,
    })),
    unseal: vi.fn((ciphertext: Uint8Array) => {
      const key = Array.from(ciphertext).join(",");
      const token = map[key];
      if (!token) throw new Error("bad ciphertext");
      return token;
    }),
  };
}

describe("ResolveCleaningQrUseCase", () => {
  it("resolves an active location QR token", async () => {
    const location = makeLocation({ commercialUnitId: null });
    const useCase = new ResolveCleaningQrUseCase(
      {
        findByTokenHash: vi.fn(async () => makeLocationQr()),
        findActiveByLocation: vi.fn(),
        issue: vi.fn(),
      } as never,
      {
        findActiveByTokenHash: vi.fn(async () => null),
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      {
        listUnitCatalog: vi.fn(async () => ({
          properties: [{ id: PROPERTY, name: "Hotel" }],
        })),
      } as never,
      {
        hash: vi.fn(() => TOKEN_HASH),
        create: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute({ tenantId: TENANT, token: TOKEN }, actor);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({
      locationId: LOCATION_ID,
      locationName: "1",
      propertyId: PROPERTY,
      propertyName: "Hotel",
      unitId: null,
    });
  });

  it("resolves legacy unit QR to the linked CleaningLocation", async () => {
    const location = makeLocation();
    const unitQrFind = vi.fn(async () => ({
      id: "uqr-1",
      tenantId: TENANT,
      propertyId: PROPERTY,
      unitId: UNIT_ID,
      tokenHash: TOKEN_HASH,
      tokenCiphertext: null,
      tokenKeyVersion: null,
      status: "ACTIVE",
      createdAt: new Date(),
      rotatedAt: null,
      revokedAt: null,
    }));
    const locationQrFind = vi.fn(async () => null);

    const useCase = new ResolveCleaningQrUseCase(
      {
        findByTokenHash: locationQrFind,
        findActiveByLocation: vi.fn(),
        issue: vi.fn(),
      } as never,
      { findActiveByTokenHash: unitQrFind } as never,
      {
        findById: vi.fn(),
        findActiveByCommercialUnit: vi.fn(async () => location),
      } as never,
      {
        listUnitCatalog: vi.fn(async () => ({
          properties: [{ id: PROPERTY, name: "Villa" }],
        })),
      } as never,
      {
        hash: vi.fn(() => TOKEN_HASH),
        create: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute({ tenantId: TENANT, token: TOKEN }, actor);
    expect(result.isSuccess).toBe(true);
    expect(locationQrFind).toHaveBeenCalled();
    expect(unitQrFind).toHaveBeenCalled();
    expect(result.getValue()).toMatchObject({
      locationId: LOCATION_ID,
      locationName: "1",
      unitId: UNIT_ID,
      propertyName: "Villa",
    });
  });

  it("rejects cross-property manager access", async () => {
    const useCase = new ResolveCleaningQrUseCase(
      {
        findByTokenHash: vi.fn(async () => makeLocationQr()),
        findActiveByLocation: vi.fn(),
        issue: vi.fn(),
      } as never,
      { findActiveByTokenHash: vi.fn(async () => null) } as never,
      {
        findById: vi.fn(async () => makeLocation()),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      {
        listUnitCatalog: vi.fn(async () => ({ properties: [] })),
      } as never,
      {
        hash: vi.fn(() => TOKEN_HASH),
        create: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, token: TOKEN },
      otherPropertyActor,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("fails when neither location nor unit QR matches", async () => {
    const useCase = new ResolveCleaningQrUseCase(
      {
        findByTokenHash: vi.fn(async () => null),
        findActiveByLocation: vi.fn(),
        issue: vi.fn(),
      } as never,
      { findActiveByTokenHash: vi.fn(async () => null) } as never,
      {
        findById: vi.fn(),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      { listUnitCatalog: vi.fn() } as never,
      {
        hash: vi.fn(() => TOKEN_HASH),
        create: vi.fn(),
      } as never,
      new PermissionChecker(),
    );

    const result = await useCase.execute({ tenantId: TENANT, token: TOKEN }, actor);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });
});

describe("Get / Generate / Rotate CleaningLocation QR (recoverable)", () => {
  const location = makeLocation({ commercialUnitId: null });
  const catalog = {
    listUnitCatalog: vi.fn(async () => ({
      properties: [{ id: PROPERTY, name: "Hotel" }],
    })),
  };

  it("GET recovers the same token from sealed material", async () => {
    const sealer = makeSealer();
    const useCase = new GetCleaningLocationQrUseCase(
      {
        findActiveByLocation: vi.fn(async () => makeLocationQr()),
        findByTokenHash: vi.fn(),
        issue: vi.fn(),
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      catalog as never,
      sealer,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, locationId: LOCATION_ID },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      token: TOKEN,
      recoverable: true,
      status: "ACTIVE",
    });
    expect(sealer.unseal).toHaveBeenCalled();
  });

  it("GET reports unrecoverable legacy ACTIVE without decrypt", async () => {
    const sealer = makeSealer();
    const useCase = new GetCleaningLocationQrUseCase(
      {
        findActiveByLocation: vi.fn(async () =>
          makeLocationQr({ tokenCiphertext: null, tokenKeyVersion: null }),
        ),
        findByTokenHash: vi.fn(),
        issue: vi.fn(),
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      catalog as never,
      sealer,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, locationId: LOCATION_ID },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      token: null,
      recoverable: false,
      status: "ACTIVE",
    });
    expect(sealer.unseal).not.toHaveBeenCalled();
  });

  it("generate seals tokenHash + ciphertext and returns plaintext", async () => {
    const sealer = makeSealer();
    const issue = vi.fn(async (cmd: { tokenHash: string; tokenCiphertext: Uint8Array }) => ({
      record: makeLocationQr({
        tokenHash: cmd.tokenHash,
        tokenCiphertext: cmd.tokenCiphertext,
      }),
      issued: true,
    }));
    const useCase = new GenerateCleaningLocationQrUseCase(
      {
        findByTokenHash: vi.fn(),
        findActiveByLocation: vi.fn(),
        issue,
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      catalog as never,
      {
        create: vi.fn(() => ({ token: TOKEN, tokenHash: TOKEN_HASH })),
        hash: vi.fn(),
      } as never,
      sealer,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, locationId: LOCATION_ID },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().token).toBe(TOKEN);
    expect(result.getValue().recoverable).toBe(true);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        rotate: false,
        tokenHash: TOKEN_HASH,
        tokenCiphertext: expect.any(Uint8Array),
        tokenKeyVersion: 1,
      }),
    );
    expect(sealer.seal).toHaveBeenCalledWith(TOKEN);
  });

  it("generate on existing recoverable ACTIVE recovers without re-issue", async () => {
    const sealer = makeSealer();
    const issue = vi.fn(async () => ({
      record: makeLocationQr(),
      issued: false,
    }));
    const useCase = new GenerateCleaningLocationQrUseCase(
      {
        findByTokenHash: vi.fn(),
        findActiveByLocation: vi.fn(),
        issue,
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      catalog as never,
      {
        create: vi.fn(() => ({ token: TOKEN_B, tokenHash: TOKEN_HASH_B })),
        hash: vi.fn(),
      } as never,
      sealer,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, locationId: LOCATION_ID },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().token).toBe(TOKEN);
    expect(result.getValue().recoverable).toBe(true);
  });

  it("rotate mints new sealed token and returns new plaintext", async () => {
    const sealer = makeSealer({ "9,9,9,9": TOKEN_B });
    const issue = vi.fn(async (cmd: { tokenHash: string; tokenCiphertext: Uint8Array }) => ({
      record: makeLocationQr({
        id: "lqr-2",
        tokenHash: cmd.tokenHash,
        tokenCiphertext: cmd.tokenCiphertext,
      }),
      issued: true,
    }));
    const useCase = new RotateCleaningLocationQrUseCase(
      {
        findByTokenHash: vi.fn(),
        findActiveByLocation: vi.fn(),
        issue,
      } as never,
      {
        findById: vi.fn(async () => location),
        findActiveByCommercialUnit: vi.fn(),
      } as never,
      catalog as never,
      {
        create: vi.fn(() => ({ token: TOKEN_B, tokenHash: TOKEN_HASH_B })),
        hash: vi.fn(),
      } as never,
      sealer,
      new PermissionChecker(),
    );

    const result = await useCase.execute(
      { tenantId: TENANT, locationId: LOCATION_ID },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().token).toBe(TOKEN_B);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ rotate: true, tokenHash: TOKEN_HASH_B }),
    );
  });
});
