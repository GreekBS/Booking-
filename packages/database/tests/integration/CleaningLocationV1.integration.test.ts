/**
 * CleaningLocation V1 integration against PostgreSQL.
 *
 * Runs when TEST_DATABASE_URL is set, OR when ALLOW_TALOS_DEMO_DB_INTEGRATION=true
 * (authorized Talos single demo/dev DB workflow via test:integration:demo).
 *
 * Creates only uniquely identified cl-v1-* tenants and cleans those records up.
 * Does not touch PILOT-ICAL, workers, schedulers, or channel providers.
 */
import { it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { ConflictError } from "@hcp/domain";
import {
  PrismaCleaningLocationRepository,
  PrismaCleaningLocationQrAccessRepository,
} from "../../src";
import {
  prisma,
  clearTenantContext,
  withTenantTransaction,
  verifyCleaningLocationRlsPoliciesActive,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT = randomUUID();
const TENANT_B = randomUUID();
const PROP_EMPTY = randomUUID();
const PROP_VILLA = randomUUID();
const PROP_B = randomUUID();
const UNIT_VILLA = randomUUID();
const USER = randomUUID();
const SLUG = `cl-v1-${TENANT.slice(0, 8)}`;

runIntegration("CleaningLocation V1", () => {
  const locations = new PrismaCleaningLocationRepository();
  const qr = new PrismaCleaningLocationQrAccessRepository();

  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.user.create({
      data: {
        id: USER,
        email: `cl-v1-${USER.slice(0, 8)}@demo.test`,
        name: "CL V1",
      },
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: TENANT,
          name: "CL V1 Tenant",
          slug: SLUG,
        },
        {
          id: TENANT_B,
          name: "CL V1 Tenant B",
          slug: `cl-v1-b-${TENANT_B.slice(0, 8)}`,
        },
      ],
    });
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.createMany({
        data: [
          {
            id: PROP_EMPTY,
            tenantId: TENANT,
            name: "Hotel Empty",
            slug: `he-${PROP_EMPTY.slice(0, 8)}`,
            timezone: "Europe/Athens",
          },
          {
            id: PROP_VILLA,
            tenantId: TENANT,
            name: "Villa One",
            slug: `vo-${PROP_VILLA.slice(0, 8)}`,
            timezone: "Europe/Athens",
          },
        ],
      });
      await tx.unit.create({
        data: {
          id: UNIT_VILLA,
          tenantId: TENANT,
          propertyId: PROP_VILLA,
          name: "Olivia",
          slug: `ol-${UNIT_VILLA.slice(0, 8)}`,
          maxGuests: 6,
        },
      });
    });
    await withTenantTransaction(TENANT_B, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP_B,
          tenantId: TENANT_B,
          name: "Other Tenant Prop",
          slug: `ob-${PROP_B.slice(0, 8)}`,
          timezone: "Europe/Athens",
        },
      });
    });
  });

  afterAll(async () => {
    try {
      await withTenantTransaction(TENANT, async (tx) => {
        await tx.cleaningPhoto.deleteMany({ where: { tenantId: TENANT } });
        await tx.cleaningExecutionItem.deleteMany({
          where: { tenantId: TENANT },
        });
        await tx.cleaningExecution.deleteMany({ where: { tenantId: TENANT } });
        await tx.task.deleteMany({ where: { tenantId: TENANT } });
        await tx.unitQrAccess.deleteMany({ where: { tenantId: TENANT } });
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
      await withTenantTransaction(TENANT_B, async (tx) => {
        await tx.property.deleteMany({ where: { tenantId: TENANT_B } });
      });
    } finally {
      await clearTenantContext(prisma);
      await prisma.tenant.deleteMany({
        where: { id: { in: [TENANT, TENANT_B] } },
      });
      await prisma.user.deleteMany({ where: { id: USER } });
      await prisma.$disconnect();
    }
  });

  it("has FORCE RLS on CleaningLocation V1 tables", async () => {
    expect(await verifyCleaningLocationRlsPoliciesActive()).toBe(true);

    const forced = await prisma.$queryRaw<
      Array<{ relname: string; relforcerowsecurity: boolean }>
    >`
      SELECT c.relname, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'cleaning_locations',
          'cleaning_location_statuses',
          'cleaning_location_qr_access'
        )
    `;
    expect(forced).toHaveLength(3);
    expect(forced.every((r) => r.relforcerowsecurity === true)).toBe(true);
  });

  it("bulk creates N locations without Unit / RatePlan / channel / calendar side effects", async () => {
    const commercialBefore = await withTenantTransaction(TENANT, async (tx) => ({
      units: await tx.unit.count({
        where: { tenantId: TENANT, deletedAt: null },
      }),
      ratePlans: await tx.ratePlan.count({ where: { tenantId: TENANT } }),
      mappings: await tx.channelListingMapping.count({
        where: { tenantId: TENANT },
      }),
      blocks: await tx.unitCalendarBlock.count({ where: { tenantId: TENANT } }),
    }));

    const created = await locations.bulkCreate({
      tenantId: TENANT,
      propertyId: PROP_EMPTY,
      count: 30,
      actorUserId: USER,
    });
    expect(created).toHaveLength(30);
    expect(created.map((c) => c.name)).toEqual(
      Array.from({ length: 30 }, (_, i) => String(i + 1)),
    );
    expect(created.every((c) => c.commercialUnitId === null)).toBe(true);

    const statuses = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningLocationStatus.findMany({
        where: { tenantId: TENANT, propertyId: PROP_EMPTY },
      }),
    );
    expect(statuses).toHaveLength(30);
    expect(statuses.every((s) => s.status === "CLEAN" && s.source === "INIT")).toBe(
      true,
    );
    expect(statuses.every((s) => s.updatedByUserId === null)).toBe(true);

    const commercialAfter = await withTenantTransaction(TENANT, async (tx) => ({
      units: await tx.unit.count({
        where: { tenantId: TENANT, deletedAt: null },
      }),
      ratePlans: await tx.ratePlan.count({ where: { tenantId: TENANT } }),
      mappings: await tx.channelListingMapping.count({
        where: { tenantId: TENANT },
      }),
      blocks: await tx.unitCalendarBlock.count({ where: { tenantId: TENANT } }),
    }));
    expect(commercialAfter.units).toBe(commercialBefore.units);
    expect(commercialAfter.ratePlans).toBe(commercialBefore.ratePlans);
    expect(commercialAfter.mappings).toBe(commercialBefore.mappings);
    expect(commercialAfter.blocks).toBe(commercialBefore.blocks);

    await expect(
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: PROP_EMPTY,
        count: 5,
        actorUserId: USER,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("concurrent bulk init does not duplicate", async () => {
    const prop = randomUUID();
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: prop,
          tenantId: TENANT,
          name: "Concurrent Prop",
          slug: `cp-${prop.slice(0, 8)}`,
          timezone: "Europe/Athens",
        },
      });
    });

    const results = await Promise.allSettled([
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: prop,
        count: 10,
        actorUserId: USER,
      }),
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: prop,
        count: 10,
        actorUserId: USER,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const count = await locations.countActiveByProperty(TENANT, prop);
    expect(count).toBe(10);
  });

  it("rename keeps id and does not rotate QR; rotate revokes previous", async () => {
    const [first] = await locations.listActiveByProperty(TENANT, PROP_EMPTY);
    expect(first).toBeTruthy();

    const issued = await qr.issue({
      tenantId: TENANT,
      propertyId: PROP_EMPTY,
      cleaningLocationId: first!.id,
      tokenHash: `hash-${first!.id}`.padEnd(64, "a").slice(0, 64),
      tokenCiphertext: new Uint8Array(32).fill(1),
      tokenKeyVersion: 1,
      rotate: false,
    });
    expect(issued.issued).toBe(true);

    const renamed = await locations.rename({
      tenantId: TENANT,
      locationId: first!.id,
      name: "Junior Suite",
    });
    expect(renamed.id).toBe(first!.id);
    expect(renamed.name).toBe("Junior Suite");

    const activeAfterRename = await qr.findActiveByLocation(TENANT, first!.id);
    expect(activeAfterRename?.id).toBe(issued.record.id);
    expect(activeAfterRename?.tokenHash).toBe(issued.record.tokenHash);
    expect(activeAfterRename?.tokenCiphertext).not.toBeNull();

    const rotated = await qr.issue({
      tenantId: TENANT,
      propertyId: PROP_EMPTY,
      cleaningLocationId: first!.id,
      tokenHash: `rot-${first!.id}`.padEnd(64, "b").slice(0, 64),
      tokenCiphertext: new Uint8Array(32).fill(2),
      tokenKeyVersion: 1,
      rotate: true,
    });
    expect(rotated.record.id).not.toBe(issued.record.id);
    expect(rotated.record.status).toBe("ACTIVE");

    const oldRow = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningLocationQrAccess.findFirst({
        where: { id: issued.record.id },
      }),
    );
    expect(oldRow?.status).toBe("REVOKED");
    expect(oldRow?.revokedAt).toBeTruthy();

    const actives = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningLocationQrAccess.count({
        where: {
          tenantId: TENANT,
          cleaningLocationId: first!.id,
          status: "ACTIVE",
        },
      }),
    );
    expect(actives).toBe(1);
  });

  it("board returns summary rows without plaintext tokens", async () => {
    const board = await locations.getBoard(TENANT, PROP_EMPTY);
    expect(board.length).toBeGreaterThanOrEqual(30);
    expect(board.every((row) => typeof row.hasActiveQr === "boolean")).toBe(true);
    expect(board.some((row) => "token" in row)).toBe(false);
    const names = board.map((r) => r.name);
    const juniorIdx = names.indexOf("Junior Suite");
    expect(juniorIdx).toBeGreaterThanOrEqual(0);
  });

  it("archive retains history and removes from active board", async () => {
    const added = await locations.add({
      tenantId: TENANT,
      propertyId: PROP_EMPTY,
      name: "Archive Me",
      actorUserId: USER,
    });

    const taskId = randomUUID();
    const executionId = randomUUID();
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.task.create({
        data: {
          id: taskId,
          tenantId: TENANT,
          propertyId: PROP_EMPTY,
          cleaningLocationId: added.id,
          category: "HOUSEKEEPING",
          title: "CL V1 hist",
          status: "COMPLETED",
          priority: "NORMAL",
          createdByUserId: USER,
        },
      });
      await tx.cleaningExecution.create({
        data: {
          id: executionId,
          tenantId: TENANT,
          propertyId: PROP_EMPTY,
          cleaningLocationId: added.id,
          taskId,
          status: "COMPLETED",
          startedByUserId: USER,
          completedByUserId: USER,
          completedAt: new Date(),
        },
      });
      await tx.cleaningPhoto.create({
        data: {
          id: randomUUID(),
          tenantId: TENANT,
          propertyId: PROP_EMPTY,
          cleaningLocationId: added.id,
          taskId,
          executionId,
          storageKey: `cl-v1/${TENANT}/${executionId}/photo.jpg`,
          contentType: "image/jpeg",
          sizeBytes: 1024,
          uploadedByUserId: USER,
        },
      });
    });

    const archived = await locations.archive({
      tenantId: TENANT,
      locationId: added.id,
    });
    expect(archived.status).toBe("archived");
    expect(archived.id).toBe(added.id);

    const board = await locations.getBoard(TENANT, PROP_EMPTY);
    expect(board.some((r) => r.locationId === added.id)).toBe(false);

    const histExec = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningExecution.findFirst({
        where: { id: executionId, tenantId: TENANT },
      }),
    );
    expect(histExec?.cleaningLocationId).toBe(added.id);
    const histPhoto = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningPhoto.findFirst({
        where: { executionId, tenantId: TENANT },
      }),
    );
    expect(histPhoto?.cleaningLocationId).toBe(added.id);
  });

  it("tenant isolation: other tenant cannot see locations", async () => {
    const foreign = await locations.listActiveByProperty(TENANT_B, PROP_EMPTY);
    expect(foreign).toHaveLength(0);

    const boardB = await locations.getBoard(TENANT_B, PROP_EMPTY);
    expect(boardB).toHaveLength(0);

    const own = await locations.countActiveByProperty(TENANT, PROP_EMPTY);
    expect(own).toBeGreaterThanOrEqual(30);
  });

  it("legacy Unit QR remains resolvable via commercialUnitId link", async () => {
    const loc = await locations.add({
      tenantId: TENANT,
      propertyId: PROP_VILLA,
      name: "Olivia",
      actorUserId: USER,
      commercialUnitId: UNIT_VILLA,
    });
    expect(loc.commercialUnitId).toBe(UNIT_VILLA);

    const unitsAfter = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({
        where: { tenantId: TENANT, propertyId: PROP_VILLA, deletedAt: null },
      }),
    );
    expect(unitsAfter).toBe(1);

    const legacyHash = `legacy-${UNIT_VILLA}`.padEnd(64, "c").slice(0, 64);
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unitQrAccess.create({
        data: {
          id: randomUUID(),
          tenantId: TENANT,
          propertyId: PROP_VILLA,
          unitId: UNIT_VILLA,
          tokenHash: legacyHash,
          status: "ACTIVE",
        },
      });
    });

    const linked = await locations.findActiveByCommercialUnit(
      TENANT,
      UNIT_VILLA,
    );
    expect(linked?.id).toBe(loc.id);

    await expect(
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: PROP_VILLA,
        count: 5,
        actorUserId: USER,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("CleaningExecution and CleaningPhoto associate to CleaningLocation", async () => {
    const [loc] = await locations.listActiveByProperty(TENANT, PROP_VILLA);
    expect(loc).toBeTruthy();

    const taskId = randomUUID();
    const executionId = randomUUID();
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.task.create({
        data: {
          id: taskId,
          tenantId: TENANT,
          propertyId: PROP_VILLA,
          cleaningLocationId: loc!.id,
          category: "HOUSEKEEPING",
          title: "CL V1 clean",
          status: "IN_PROGRESS",
          priority: "NORMAL",
          createdByUserId: USER,
        },
      });
      await tx.cleaningExecution.create({
        data: {
          id: executionId,
          tenantId: TENANT,
          propertyId: PROP_VILLA,
          cleaningLocationId: loc!.id,
          taskId,
          status: "IN_PROGRESS",
          startedByUserId: USER,
        },
      });
      await tx.cleaningPhoto.create({
        data: {
          id: randomUUID(),
          tenantId: TENANT,
          propertyId: PROP_VILLA,
          cleaningLocationId: loc!.id,
          taskId,
          executionId,
          storageKey: `cl-v1/${TENANT}/${executionId}/a.jpg`,
          contentType: "image/jpeg",
          sizeBytes: 2048,
          uploadedByUserId: USER,
        },
      });
    });

    const execs = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningExecution.findMany({
        where: { tenantId: TENANT, cleaningLocationId: loc!.id },
      }),
    );
    expect(execs.length).toBeGreaterThanOrEqual(1);
    const photos = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningPhoto.findMany({
        where: { tenantId: TENANT, cleaningLocationId: loc!.id },
      }),
    );
    expect(photos.length).toBeGreaterThanOrEqual(1);
  });

  it("existing migrated Olive history remains readable (read-only)", async () => {
    // Catalog discovery may need DATABASE_URL (bypass/session) while counts
    // run under talos_runtime + withTenantTransaction.
    const { PrismaClient } = await import("@prisma/client");
    const catalogUrl =
      process.env.DATABASE_URL?.trim() ||
      process.env.RUNTIME_DATABASE_URL?.trim() ||
      "";
    const catalog = new PrismaClient({
      datasources: { db: { url: catalogUrl } },
    });
    try {
      const olive = await catalog.property.findFirst({
        where: { name: "Olive", deletedAt: null },
        select: { id: true, tenantId: true },
      });
      if (!olive) return;
      const linked = await withTenantTransaction(olive.tenantId, async (tx) =>
        tx.cleaningLocation.count({
          where: {
            tenantId: olive.tenantId,
            propertyId: olive.id,
            status: "active",
            commercialUnitId: { not: null },
          },
        }),
      );
      expect(linked).toBeGreaterThanOrEqual(1);
      const execCount = await withTenantTransaction(olive.tenantId, async (tx) =>
        tx.cleaningExecution.count({
          where: {
            tenantId: olive.tenantId,
            propertyId: olive.id,
            cleaningLocationId: { not: null },
          },
        }),
      );
      expect(execCount).toBeGreaterThanOrEqual(1);
    } finally {
      await catalog.$disconnect();
    }
  });

  it("ensureSingleActive reuses existing location and is concurrency-safe", async () => {
    const prop = randomUUID();
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: prop,
          tenantId: TENANT,
          name: "Single Mode Villa",
          slug: `sv-${prop.slice(0, 8)}`,
          type: "villa",
          timezone: "Europe/Athens",
        },
      });
    });

    const commercialBefore = await withTenantTransaction(TENANT, async (tx) => ({
      units: await tx.unit.count({
        where: { tenantId: TENANT, deletedAt: null },
      }),
      ratePlans: await tx.ratePlan.count({ where: { tenantId: TENANT } }),
      mappings: await tx.channelListingMapping.count({
        where: { tenantId: TENANT },
      }),
      blocks: await tx.unitCalendarBlock.count({ where: { tenantId: TENANT } }),
    }));

    const first = await locations.ensureSingleActive({
      tenantId: TENANT,
      propertyId: prop,
      name: "Single Mode Villa",
      actorUserId: USER,
    });
    expect(first.created).toBe(true);
    expect(first.location.name).toBe("Single Mode Villa");

    const second = await locations.ensureSingleActive({
      tenantId: TENANT,
      propertyId: prop,
      name: "Should Not Duplicate",
      actorUserId: USER,
    });
    expect(second.created).toBe(false);
    expect(second.location.id).toBe(first.location.id);
    expect(second.location.name).toBe("Single Mode Villa");

    const concurrentProp = randomUUID();
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: concurrentProp,
          tenantId: TENANT,
          name: "Concurrent Single",
          slug: `cs-${concurrentProp.slice(0, 8)}`,
          type: "apartment",
          timezone: "Europe/Athens",
        },
      });
    });

    const concurrent = await Promise.all([
      locations.ensureSingleActive({
        tenantId: TENANT,
        propertyId: concurrentProp,
        name: "Concurrent Single",
        actorUserId: USER,
      }),
      locations.ensureSingleActive({
        tenantId: TENANT,
        propertyId: concurrentProp,
        name: "Concurrent Single",
        actorUserId: USER,
      }),
    ]);
    expect(concurrent.map((r) => r.location.id).sort()[0]).toBe(
      concurrent.map((r) => r.location.id).sort()[1],
    );
    expect(await locations.countActiveByProperty(TENANT, concurrentProp)).toBe(1);

    const commercialAfter = await withTenantTransaction(TENANT, async (tx) => ({
      units: await tx.unit.count({
        where: { tenantId: TENANT, deletedAt: null },
      }),
      ratePlans: await tx.ratePlan.count({ where: { tenantId: TENANT } }),
      mappings: await tx.channelListingMapping.count({
        where: { tenantId: TENANT },
      }),
      blocks: await tx.unitCalendarBlock.count({ where: { tenantId: TENANT } }),
    }));
    expect(commercialAfter.units).toBe(commercialBefore.units);
    expect(commercialAfter.ratePlans).toBe(commercialBefore.ratePlans);
    expect(commercialAfter.mappings).toBe(commercialBefore.mappings);
    expect(commercialAfter.blocks).toBe(commercialBefore.blocks);
  });
});
