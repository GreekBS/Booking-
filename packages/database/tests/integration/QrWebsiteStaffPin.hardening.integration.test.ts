/**
 * Public QR → Staff PIN → hk_staff → CLEAN/DIRTY hardening integration.
 *
 * Requires TEST_DATABASE_URL pointing at local hcp_test (or authorized demo gate).
 * Never targets Talos Production.
 */
import { it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  ForbiddenError,
  HmacHkStaffCapabilitySigner,
  NotFoundError,
  ResolvePublicQrRouteUseCase,
  UnlockHousekeepingStaffUseCase,
  GetStaffHousekeepingStatusUseCase,
  MarkStaffHousekeepingStatusUseCase,
  STAFF_PIN_MAX_ATTEMPTS,
  STAFF_PIN_LOCKOUT_MS,
  type IPasswordHasher,
  type IAuditLogRepository,
  type AuditEntry,
} from "@hcp/domain";
import {
  PrismaCleaningLocationRepository,
  PrismaCleaningLocationQrAccessRepository,
  PrismaPublicCleaningQrLookup,
  PrismaPropertyStaffPinRepository,
  PrismaUnitHousekeepingStatusRepository,
  CryptoOpaqueTokenFactory,
  generateOpaqueToken,
  assertNotTalosProductionDatabase,
} from "../../src";
import {
  prisma,
  clearTenantContext,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT = randomUUID();
const PROP = randomUUID();
const UNIT_204 = randomUUID();
const UNIT_205 = randomUUID();
const LOC_204 = randomUUID();
const LOC_205 = randomUUID();
const USER = randomUUID();
const SLUG = `hk-staff-${TENANT.slice(0, 8)}`;

class TestBcryptHasher implements IPasswordHasher {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 4);
  }
  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

class MemoryAudit implements IAuditLogRepository {
  entries: AuditEntry[] = [];
  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

runIntegration("QR Website / Staff PIN housekeeping hardening", () => {
  assertNotTalosProductionDatabase(
    process.env.DATABASE_URL,
    "QrWebsiteStaffPin.hardening",
  );

  const tokens = new CryptoOpaqueTokenFactory();
  const locations = new PrismaCleaningLocationRepository();
  const locationQr = new PrismaCleaningLocationQrAccessRepository();
  const lookup = new PrismaPublicCleaningQrLookup();
  const staffPin = new PrismaPropertyStaffPinRepository();
  const unitHk = new PrismaUnitHousekeepingStatusRepository();
  const hasher = new TestBcryptHasher();
  const capability = new HmacHkStaffCapabilitySigner(
    "hk_staff_integration_test_secret",
  );
  const audit = new MemoryAudit();

  const resolvePublic = new ResolvePublicQrRouteUseCase(
    tokens,
    lookup,
    staffPin,
    locations,
  );
  const unlock = new UnlockHousekeepingStaffUseCase(
    resolvePublic,
    staffPin,
    hasher,
    capability,
  );
  const getStatus = new GetStaffHousekeepingStatusUseCase(
    locations,
    // Minimal property repo surface used by getStatus — use prisma-backed stub via ensure
    {
      async findById(tenantId: string, propertyId: string) {
        return withTenantTransaction(tenantId, async (tx) => {
          const row = await tx.property.findFirst({
            where: { id: propertyId, tenantId, deletedAt: null },
            include: { units: true },
          });
          if (!row) return null;
          return {
            id: row.id,
            tenantId: row.tenantId,
            name: row.name,
            websiteUrl: row.websiteUrl,
            units: row.units.map((u) => ({
              id: u.id,
              name: u.name,
            })),
          } as never;
        });
      },
    } as never,
    lookup,
    staffPin,
  );
  const markStatus = new MarkStaffHousekeepingStatusUseCase(
    locations,
    unitHk,
    getStatus,
    lookup,
    audit,
  );

  let token204 = "";
  let token205 = "";
  let hash204 = "";

  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.user.create({
      data: {
        id: USER,
        email: `hk-staff-${USER.slice(0, 8)}@integration.test`,
        name: "HK Staff IT",
      },
    });
    await prisma.tenant.create({
      data: { id: TENANT, name: "HK Staff Tenant", slug: SLUG },
    });
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP,
          tenantId: TENANT,
          name: "Hotel Isolation",
          slug: `hi-${PROP.slice(0, 8)}`,
          timezone: "Europe/Athens",
          websiteUrl: null,
        },
      });
      await tx.unit.createMany({
        data: [
          {
            id: UNIT_204,
            tenantId: TENANT,
            propertyId: PROP,
            name: "Room 204",
            slug: `r204-${UNIT_204.slice(0, 8)}`,
            maxGuests: 2,
          },
          {
            id: UNIT_205,
            tenantId: TENANT,
            propertyId: PROP,
            name: "Room 205",
            slug: `r205-${UNIT_205.slice(0, 8)}`,
            maxGuests: 2,
          },
        ],
      });
      await tx.cleaningLocation.createMany({
        data: [
          {
            id: LOC_204,
            tenantId: TENANT,
            propertyId: PROP,
            name: "Room 204",
            status: "active",
            sortOrder: 1,
            commercialUnitId: UNIT_204,
            updatedAt: new Date(),
          },
          {
            id: LOC_205,
            tenantId: TENANT,
            propertyId: PROP,
            name: "Room 205",
            status: "active",
            sortOrder: 2,
            commercialUnitId: UNIT_205,
            updatedAt: new Date(),
          },
        ],
      });
      await tx.cleaningLocationStatus.createMany({
        data: [
          {
            cleaningLocationId: LOC_204,
            tenantId: TENANT,
            propertyId: PROP,
            status: "CLEAN",
            source: "INIT",
            version: 1,
            updatedAt: new Date(),
          },
          {
            cleaningLocationId: LOC_205,
            tenantId: TENANT,
            propertyId: PROP,
            status: "CLEAN",
            source: "INIT",
            version: 1,
            updatedAt: new Date(),
          },
        ],
      });
      await tx.unitHousekeepingStatus.createMany({
        data: [
          {
            unitId: UNIT_204,
            tenantId: TENANT,
            propertyId: PROP,
            status: "CLEAN",
            source: "INIT",
            version: 1,
            updatedAt: new Date(),
          },
          {
            unitId: UNIT_205,
            tenantId: TENANT,
            propertyId: PROP,
            status: "CLEAN",
            source: "INIT",
            version: 1,
            updatedAt: new Date(),
          },
        ],
      });
    });

    const minted204 = generateOpaqueToken();
    const minted205 = generateOpaqueToken();
    token204 = minted204.token;
    hash204 = minted204.tokenHash;
    token205 = minted205.token;

    await locationQr.issue({
      tenantId: TENANT,
      propertyId: PROP,
      cleaningLocationId: LOC_204,
      tokenHash: minted204.tokenHash,
      tokenCiphertext: new Uint8Array(32).fill(3),
      tokenKeyVersion: 1,
      rotate: false,
    });
    await locationQr.issue({
      tenantId: TENANT,
      propertyId: PROP,
      cleaningLocationId: LOC_205,
      tokenHash: minted205.tokenHash,
      tokenCiphertext: new Uint8Array(32).fill(4),
      tokenKeyVersion: 1,
      rotate: false,
    });

    await staffPin.setPinHash(
      TENANT,
      PROP,
      await hasher.hash("1234"),
      new Date("2026-10-06T10:00:00.000Z"),
    );
  });

  afterAll(async () => {
    try {
      await withTenantTransaction(TENANT, async (tx) => {
        await tx.auditLog.deleteMany({ where: { tenantId: TENANT } });
        await tx.unitHousekeepingStatus.deleteMany({ where: { tenantId: TENANT } });
        await tx.cleaningLocationQrAccess.deleteMany({
          where: { tenantId: TENANT },
        });
        await tx.cleaningLocationStatus.deleteMany({
          where: { tenantId: TENANT },
        });
        await tx.cleaningLocation.deleteMany({ where: { tenantId: TENANT } });
        await tx.unit.deleteMany({ where: { tenantId: TENANT } });
        await tx.property.deleteMany({ where: { tenantId: TENANT } });
      });
    } finally {
      await clearTenantContext(prisma);
      await prisma.tenant.deleteMany({ where: { id: TENANT } });
      await prisma.user.deleteMany({ where: { id: USER } });
      await prisma.$disconnect();
    }
  });

  it("1) full path: resolve → PIN → capability → DIRTY → CLEAN with DB authority", async () => {
    const routed = await resolvePublic.execute({ token: token204 });
    expect(routed.isSuccess).toBe(true);
    expect(routed.getValue().route.kind).toBe("staff_pin");

    const unlocked = await unlock.execute({
      token: token204,
      pin: "1234",
      now: new Date("2026-10-06T12:00:00.000Z"),
    });
    expect(unlocked.isSuccess).toBe(true);
    const { claims } = unlocked.getValue();
    expect(claims.typ).toBe("hk_staff");
    expect(claims.locationId).toBe(LOC_204);
    expect(claims.unitId).toBe(UNIT_204);
    expect(claims.tokenHash).toBe(hash204);

    const before = await getStatus.execute({ claims });
    expect(before.isSuccess).toBe(true);
    expect(before.getValue().status).toBe("CLEAN");

    audit.entries = [];
    const dirty = await markStatus.execute({
      claims,
      target: "DIRTY",
      expectedVersion: before.getValue().version,
    });
    expect(dirty.isSuccess).toBe(true);
    expect(dirty.getValue().status).toBe("DIRTY");

    const dbDirty = await withTenantTransaction(TENANT, async (tx) => ({
      loc: await tx.cleaningLocationStatus.findUnique({
        where: { cleaningLocationId: LOC_204 },
      }),
      unit: await tx.unitHousekeepingStatus.findUnique({
        where: { unitId: UNIT_204 },
      }),
      otherLoc: await tx.cleaningLocationStatus.findUnique({
        where: { cleaningLocationId: LOC_205 },
      }),
      otherUnit: await tx.unitHousekeepingStatus.findUnique({
        where: { unitId: UNIT_205 },
      }),
    }));
    expect(dbDirty.loc?.status).toBe("DIRTY");
    expect(dbDirty.loc?.source).toBe("QR_STAFF");
    expect(dbDirty.unit?.status).toBe("DIRTY");
    expect(dbDirty.unit?.source).toBe("QR_STAFF");
    expect(dbDirty.otherLoc?.status).toBe("CLEAN");
    expect(dbDirty.otherUnit?.status).toBe("CLEAN");

    expect(audit.entries.some((e) => e.action === "housekeeping.marked_dirty")).toBe(
      true,
    );
    const dirtyAudit = audit.entries.find(
      (e) => e.action === "housekeeping.marked_dirty",
    );
    expect(dirtyAudit?.metadata?.source).toBe("QR_STAFF");
    const auditJson = JSON.stringify(audit.entries);
    expect(auditJson).not.toContain("1234");
    expect(auditJson).not.toContain("5678");
    expect(auditJson).not.toContain("9999");
    expect(auditJson).not.toMatch(/"pin"\s*:/);
    expect(auditJson).not.toMatch(/pinHash/i);
    expect(auditJson).not.toMatch(/capabilityToken/i);

    const clean = await markStatus.execute({
      claims,
      target: "CLEAN",
      expectedVersion: dirty.getValue().version,
    });
    expect(clean.isSuccess).toBe(true);
    expect(clean.getValue().status).toBe("CLEAN");

    const dbClean = await withTenantTransaction(TENANT, async (tx) => ({
      loc: await tx.cleaningLocationStatus.findUnique({
        where: { cleaningLocationId: LOC_204 },
      }),
      unit: await tx.unitHousekeepingStatus.findUnique({
        where: { unitId: UNIT_204 },
      }),
    }));
    expect(dbClean.loc?.status).toBe("CLEAN");
    expect(dbClean.unit?.status).toBe("CLEAN");
    expect(dbClean.loc?.source).toBe("QR_STAFF");
  });

  it("2) multi-room isolation: 204 capability cannot mutate 205", async () => {
    const unlocked204 = await unlock.execute({
      token: token204,
      pin: "1234",
      now: new Date("2026-10-06T12:10:00.000Z"),
    });
    const claims204 = unlocked204.getValue().claims;

    const forged205 = {
      ...claims204,
      locationId: LOC_205,
      unitId: UNIT_205,
    };

    const read205 = await getStatus.execute({ claims: forged205 });
    expect(read205.isFailure).toBe(true);
    expect(read205.getError()).toBeInstanceOf(ForbiddenError);

    const mark205 = await markStatus.execute({
      claims: forged205,
      target: "DIRTY",
      expectedVersion: 1,
    });
    expect(mark205.isFailure).toBe(true);

    const stillClean = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningLocationStatus.findUnique({
        where: { cleaningLocationId: LOC_205 },
      }),
    );
    expect(stillClean?.status).toBe("CLEAN");
  });

  it("3) QR rotate/revoke: old token and old capability fail closed", async () => {
    const unlocked = await unlock.execute({
      token: token204,
      pin: "1234",
      now: new Date("2026-10-06T12:20:00.000Z"),
    });
    const oldClaims = unlocked.getValue().claims;

    const rotated = generateOpaqueToken();
    await locationQr.issue({
      tenantId: TENANT,
      propertyId: PROP,
      cleaningLocationId: LOC_204,
      tokenHash: rotated.tokenHash,
      tokenCiphertext: new Uint8Array(32).fill(9),
      tokenKeyVersion: 1,
      rotate: true,
    });

    const oldResolve = await resolvePublic.execute({ token: token204 });
    expect(oldResolve.isFailure).toBe(true);
    expect(oldResolve.getError()).toBeInstanceOf(NotFoundError);

    const oldCap = await getStatus.execute({ claims: oldClaims });
    expect(oldCap.isFailure).toBe(true);
    expect(oldCap.getError()).toBeInstanceOf(ForbiddenError);

    const oldMark = await markStatus.execute({
      claims: oldClaims,
      target: "DIRTY",
      expectedVersion: 1,
    });
    expect(oldMark.isFailure).toBe(true);

    token204 = rotated.token;
    hash204 = rotated.tokenHash;

    const newUnlock = await unlock.execute({
      token: token204,
      pin: "1234",
      now: new Date("2026-10-06T12:21:00.000Z"),
    });
    expect(newUnlock.isSuccess).toBe(true);
    expect(newUnlock.getValue().claims.tokenHash).toBe(hash204);
  });

  it("4) PIN rotation invalidates prior capability and old PIN", async () => {
    const unlockedA = await unlock.execute({
      token: token204,
      pin: "1234",
      now: new Date("2026-10-06T12:30:00.000Z"),
    });
    expect(unlockedA.isSuccess).toBe(true);
    const claimsA = unlockedA.getValue().claims;

    await staffPin.setPinHash(
      TENANT,
      PROP,
      await hasher.hash("5678"),
      new Date("2026-10-06T12:31:00.000Z"),
    );

    const stale = await getStatus.execute({ claims: claimsA });
    expect(stale.isFailure).toBe(true);
    expect(stale.getError()).toBeInstanceOf(ForbiddenError);

    const oldPin = await unlock.execute({
      token: token204,
      pin: "1234",
      now: new Date("2026-10-06T12:32:00.000Z"),
    });
    expect(oldPin.isFailure).toBe(true);

    const newPin = await unlock.execute({
      token: token204,
      pin: "5678",
      now: new Date("2026-10-06T12:33:00.000Z"),
    });
    expect(newPin.isSuccess).toBe(true);
  });

  it("5) authoritative PIN lockout after 5 failures (15 minutes)", async () => {
    await staffPin.setPinHash(
      TENANT,
      PROP,
      await hasher.hash("9999"),
      new Date("2026-10-06T13:00:00.000Z"),
    );

    const t0 = new Date("2026-10-06T13:01:00.000Z");
    for (let i = 0; i < STAFF_PIN_MAX_ATTEMPTS; i++) {
      const fail = await unlock.execute({
        token: token204,
        pin: "0000",
        now: new Date(t0.getTime() + i * 1000),
      });
      expect(fail.isFailure).toBe(true);
    }

    const lockedRow = await staffPin.getForProperty(TENANT, PROP);
    expect(lockedRow?.lockedUntil).toBeTruthy();
    expect(lockedRow!.lockedUntil!.getTime()).toBe(
      t0.getTime() + (STAFF_PIN_MAX_ATTEMPTS - 1) * 1000 + STAFF_PIN_LOCKOUT_MS,
    );

    const duringLock = await unlock.execute({
      token: token204,
      pin: "9999",
      now: new Date(lockedRow!.lockedUntil!.getTime() - 60_000),
    });
    expect(duringLock.isFailure).toBe(true);
    expect(duringLock.getError()).toBeInstanceOf(ForbiddenError);

    const afterLock = await unlock.execute({
      token: token204,
      pin: "9999",
      now: new Date(lockedRow!.lockedUntil!.getTime() + 1000),
    });
    expect(afterLock.isSuccess).toBe(true);

    const cleared = await staffPin.getForProperty(TENANT, PROP);
    expect(cleared?.failedAttempts).toBe(0);
    expect(cleared?.lockedUntil).toBeNull();
  });

  it("6) capability tamper/expiry rejected; typ=hk_staff; no Auth.js elevation", async () => {
    const issued = capability.issue({
      tenantId: TENANT,
      propertyId: PROP,
      locationId: LOC_204,
      unitId: UNIT_204,
      qrAccessId: (await locationQr.findActiveByLocation(TENANT, LOC_204))!.id,
      tokenHash: hash204,
      now: new Date("2026-10-06T14:00:00.000Z"),
      ttlSeconds: 60,
    });
    expect(issued.claims.typ).toBe("hk_staff");
    expect(issued.claims.exp - issued.claims.iat).toBe(60);

    expect(capability.verify(issued.token + "tamper")).toBeNull();
    expect(
      capability.verify(issued.token, new Date("2026-10-06T14:02:00.000Z")),
    ).toBeNull();

    // Capability is not an Auth.js session — no userId/session fields present.
    expect(issued.claims).not.toHaveProperty("userId");
    expect(issued.claims).not.toHaveProperty("sessionToken");
    expect(Object.keys(issued.claims).sort()).toEqual(
      [
        "exp",
        "iat",
        "locationId",
        "propertyId",
        "qrAccessId",
        "tenantId",
        "tokenHash",
        "typ",
        "unitId",
        "v",
      ].sort(),
    );
  });

  it("8) website redirect comes only from Property.websiteUrl", async () => {
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.update({
        where: { id: PROP },
        data: { websiteUrl: "https://villa.example/" },
      });
    });

    const routed = await resolvePublic.execute({ token: token204 });
    expect(routed.isSuccess).toBe(true);
    const route = routed.getValue().route;
    expect(route.kind).toBe("redirect_website");
    if (route.kind === "redirect_website") {
      expect(route.websiteUrl).toBe("https://villa.example/");
    }

    // Clearing website restores staff PIN route (QR does not embed website).
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.update({
        where: { id: PROP },
        data: { websiteUrl: null },
      });
    });
    const pinRoute = await resolvePublic.execute({ token: token204 });
    expect(pinRoute.getValue().route.kind).toBe("staff_pin");
  });
});
