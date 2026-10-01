/**
 * CleaningLocation V1 authorized verification against the configured Talos
 * development/demo database (same model as HT-12 / CRM verify scripts).
 *
 * Creates only isolated cl-v1-* tenants and cleans them up.
 * Does NOT touch PILOT-ICAL, workers, schedulers, or channel providers.
 *
 * IMPORTANT: load dotenv BEFORE importing @hcp/database so Prisma binds
 * RUNTIME_DATABASE_URL (talos_runtime) when available.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

async function main(): Promise<void> {
  const { ConflictError } = await import("@hcp/domain");
  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    PrismaCleaningLocationRepository,
    PrismaCleaningLocationQrAccessRepository,
    isTalosProductionDatabaseUrl,
    assertNotTalosProductionDatabase,
  } = await import("../src/index.js");

  const dbUrl =
    process.env.RUNTIME_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "cleaning-locations-v1-verify");
    }
  }

  const role = await prisma.$queryRawUnsafe<
    Array<{ current_user: string; rolbypassrls: boolean }>
  >(
    `SELECT current_user, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
  );

  const TENANT = randomUUID();
  const TENANT_B = randomUUID();
  const PROP_EMPTY = randomUUID();
  const PROP_VILLA = randomUUID();
  const PROP_CONCUR = randomUUID();
  const UNIT_VILLA = randomUUID();
  const USER = randomUUID();
  const results: string[] = [];

  const locations = new PrismaCleaningLocationRepository();
  const qr = new PrismaCleaningLocationQrAccessRepository();

  const report: Record<string, unknown> = {
    runtimeUser: role[0]?.current_user,
    runtimeBypassRls: role[0]?.rolbypassrls,
    databaseTarget: "configured Talos demo/development DB",
    results,
  };

  try {
    await clearTenantContext(prisma);

    // ——— RLS ———
    const rls = await prisma.$queryRaw<
      Array<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>
    >`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'cleaning_locations',
          'cleaning_location_statuses',
          'cleaning_location_qr_access'
        )
    `;
    if (rls.length !== 3 || rls.some((r) => !r.relrowsecurity || !r.relforcerowsecurity)) {
      throw new Error(`CleaningLocation RLS incomplete: ${JSON.stringify(rls)}`);
    }
    results.push("PASS FORCE RLS on cleaning_locations / statuses / qr_access");

    await prisma.user.create({
      data: {
        id: USER,
        email: `cl-v1-${USER.slice(0, 8)}@demo.test`,
        name: "CL V1 Verify",
      },
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT, name: "CL V1 Verify", slug: `cl-v1-${TENANT.slice(0, 8)}` },
        {
          id: TENANT_B,
          name: "CL V1 Verify B",
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
            name: "CL Hotel",
            slug: `clh-${PROP_EMPTY.slice(0, 8)}`,
            timezone: "Europe/Athens",
          },
          {
            id: PROP_VILLA,
            tenantId: TENANT,
            name: "CL Villa",
            slug: `clv-${PROP_VILLA.slice(0, 8)}`,
            timezone: "Europe/Athens",
          },
          {
            id: PROP_CONCUR,
            tenantId: TENANT,
            name: "CL Concurrent",
            slug: `clc-${PROP_CONCUR.slice(0, 8)}`,
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
          slug: `clo-${UNIT_VILLA.slice(0, 8)}`,
          maxGuests: 6,
        },
      });
    });

    // ——— Bulk + commercial invariants ———
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
    if (created.length !== 30) throw new Error("bulk expected 30");
    if (created.some((c) => c.commercialUnitId !== null)) {
      throw new Error("bulk locations must have null commercialUnitId");
    }
    const statuses = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningLocationStatus.count({
        where: { tenantId: TENANT, propertyId: PROP_EMPTY, status: "CLEAN" },
      }),
    );
    if (statuses !== 30) throw new Error("expected 30 CLEAN INIT statuses");

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
    if (commercialAfter.units !== commercialBefore.units) {
      throw new Error("Unit count changed after bulk");
    }
    if (commercialAfter.ratePlans !== commercialBefore.ratePlans) {
      throw new Error("RatePlan count changed after bulk");
    }
    if (commercialAfter.mappings !== commercialBefore.mappings) {
      throw new Error("ChannelListingMapping count changed after bulk");
    }
    if (commercialAfter.blocks !== commercialBefore.blocks) {
      throw new Error("UnitCalendarBlock count changed after bulk");
    }
    results.push(
      "PASS bulk 30 + Unit/RatePlan/channel/calendar invariants unchanged",
    );

    let secondRejected = false;
    try {
      await locations.bulkCreate({
        tenantId: TENANT,
        propertyId: PROP_EMPTY,
        count: 5,
        actorUserId: USER,
      });
    } catch (error) {
      secondRejected = error instanceof ConflictError;
    }
    if (!secondRejected) throw new Error("second bulk should ConflictError");
    results.push("PASS second bulk rejected (idempotent)");

    // ——— Concurrent bulk ———
    const concurrent = await Promise.allSettled([
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: PROP_CONCUR,
        count: 10,
        actorUserId: USER,
      }),
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: PROP_CONCUR,
        count: 10,
        actorUserId: USER,
      }),
    ]);
    const ok = concurrent.filter((r) => r.status === "fulfilled").length;
    const fail = concurrent.filter((r) => r.status === "rejected").length;
    if (ok !== 1 || fail !== 1) {
      throw new Error(`concurrent bulk expected 1 ok/1 fail, got ${ok}/${fail}`);
    }
    if ((await locations.countActiveByProperty(TENANT, PROP_CONCUR)) !== 10) {
      throw new Error("concurrent bulk duplicated locations");
    }
    results.push("PASS concurrent bulk: exactly one winner, count=10");

    // ——— Rename + QR ———
    const [first] = await locations.listActiveByProperty(TENANT, PROP_EMPTY);
    if (!first) throw new Error("missing location after bulk");
    const hash1 = `hash-${first.id}`.padEnd(64, "a").slice(0, 64);
    const issued = await qr.issue({
      tenantId: TENANT,
      propertyId: PROP_EMPTY,
      cleaningLocationId: first.id,
      tokenHash: hash1,
      tokenCiphertext: new Uint8Array(32).fill(1),
      tokenKeyVersion: 1,
      rotate: false,
    });
    if (!issued.issued) throw new Error("expected first QR issue");

    const renamed = await locations.rename({
      tenantId: TENANT,
      locationId: first.id,
      name: "Junior Suite",
    });
    if (renamed.id !== first.id || renamed.name !== "Junior Suite") {
      throw new Error("rename failed to preserve id/name");
    }
    const qrAfterRename = await qr.findActiveByLocation(TENANT, first.id);
    if (!qrAfterRename || qrAfterRename.id !== issued.record.id) {
      throw new Error("rename rotated QR unexpectedly");
    }
    results.push("PASS rename keeps id and does not rotate QR");

    const hash2 = `rot-${first.id}`.padEnd(64, "b").slice(0, 64);
    const rotated = await qr.issue({
      tenantId: TENANT,
      propertyId: PROP_EMPTY,
      cleaningLocationId: first.id,
      tokenHash: hash2,
      tokenCiphertext: new Uint8Array(32).fill(2),
      tokenKeyVersion: 1,
      rotate: true,
    });
    const oldQr = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningLocationQrAccess.findFirst({
        where: { id: issued.record.id },
      }),
    );
    if (oldQr?.status !== "REVOKED" || rotated.record.status !== "ACTIVE") {
      throw new Error("rotate did not revoke previous ACTIVE QR");
    }
    const activeQrCount = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningLocationQrAccess.count({
        where: {
          tenantId: TENANT,
          cleaningLocationId: first.id,
          status: "ACTIVE",
        },
      }),
    );
    if (activeQrCount !== 1) throw new Error("ACTIVE QR uniqueness broken");
    results.push("PASS QR rotate revokes previous; ACTIVE uniqueness=1");

    // ——— Board ———
    const board = await locations.getBoard(TENANT, PROP_EMPTY);
    if (board.length < 30) throw new Error("board missing rows");
    if (board.some((r) => "token" in r)) throw new Error("board leaked token");
    results.push(`PASS board rows=${board.length} (no plaintext token)`);

    // ——— Archive + history retention ———
    const toArchive = await locations.add({
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
          cleaningLocationId: toArchive.id,
          category: "HOUSEKEEPING",
          title: "CL hist",
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
          cleaningLocationId: toArchive.id,
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
          cleaningLocationId: toArchive.id,
          taskId,
          executionId,
          storageKey: `cl-v1/${TENANT}/${executionId}/p.jpg`,
          contentType: "image/jpeg",
          sizeBytes: 1024,
          uploadedByUserId: USER,
        },
      });
    });
    await locations.archive({ tenantId: TENANT, locationId: toArchive.id });
    const boardAfter = await locations.getBoard(TENANT, PROP_EMPTY);
    if (boardAfter.some((r) => r.locationId === toArchive.id)) {
      throw new Error("archived location still on board");
    }
    const keptExec = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningExecution.findFirst({ where: { id: executionId } }),
    );
    const keptPhoto = await withTenantTransaction(TENANT, async (tx) =>
      tx.cleaningPhoto.findFirst({ where: { executionId } }),
    );
    if (
      keptExec?.cleaningLocationId !== toArchive.id ||
      keptPhoto?.cleaningLocationId !== toArchive.id
    ) {
      throw new Error("archive destroyed history association");
    }
    results.push("PASS archive hides from board; execution/photo history retained");

    // ——— Tenant isolation ———
    if (
      (await locations.listActiveByProperty(TENANT_B, PROP_EMPTY)).length !== 0
    ) {
      throw new Error("tenant B saw tenant A locations");
    }
    results.push("PASS tenant isolation on listActiveByProperty");

    // ——— Legacy Unit QR + villa link ———
    const villaLoc = await locations.add({
      tenantId: TENANT,
      propertyId: PROP_VILLA,
      name: "Olivia",
      actorUserId: USER,
      commercialUnitId: UNIT_VILLA,
    });
    if (villaLoc.commercialUnitId !== UNIT_VILLA) {
      throw new Error("villa commercialUnitId not linked");
    }
    const villaUnits = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({
        where: { tenantId: TENANT, propertyId: PROP_VILLA, deletedAt: null },
      }),
    );
    if (villaUnits !== 1) {
      throw new Error("villa add created extra Unit");
    }
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
    if (linked?.id !== villaLoc.id) {
      throw new Error("legacy Unit QR path cannot resolve CleaningLocation");
    }
    let villaBulkRejected = false;
    try {
      await locations.bulkCreate({
        tenantId: TENANT,
        propertyId: PROP_VILLA,
        count: 3,
        actorUserId: USER,
      });
    } catch (error) {
      villaBulkRejected = error instanceof ConflictError;
    }
    if (!villaBulkRejected) throw new Error("villa bulk should reject");
    results.push(
      "PASS villa link + legacy Unit QR resolve + no extra Unit + bulk rejected",
    );

    // ——— Execution/photo → location ———
    const task2 = randomUUID();
    const exec2 = randomUUID();
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.task.create({
        data: {
          id: task2,
          tenantId: TENANT,
          propertyId: PROP_VILLA,
          cleaningLocationId: villaLoc.id,
          category: "HOUSEKEEPING",
          title: "CL clean",
          status: "IN_PROGRESS",
          priority: "NORMAL",
          createdByUserId: USER,
        },
      });
      await tx.cleaningExecution.create({
        data: {
          id: exec2,
          tenantId: TENANT,
          propertyId: PROP_VILLA,
          cleaningLocationId: villaLoc.id,
          taskId: task2,
          status: "IN_PROGRESS",
          startedByUserId: USER,
        },
      });
      await tx.cleaningPhoto.create({
        data: {
          id: randomUUID(),
          tenantId: TENANT,
          propertyId: PROP_VILLA,
          cleaningLocationId: villaLoc.id,
          taskId: task2,
          executionId: exec2,
          storageKey: `cl-v1/${TENANT}/${exec2}/a.jpg`,
          contentType: "image/jpeg",
          sizeBytes: 2048,
          uploadedByUserId: USER,
        },
      });
    });
    results.push("PASS CleaningExecution + CleaningPhoto → CleaningLocation");

    // ——— Olive migrated history (read-only catalog lookup) ———
    // Prefer DATABASE_URL client for catalog discovery when RUNTIME is FORCE RLS
    // without a tenant GUC; counts still run under withTenantTransaction.
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
      if (olive) {
        const oliveLocs = await withTenantTransaction(
          olive.tenantId,
          async (tx) =>
            tx.cleaningLocation.count({
              where: {
                tenantId: olive.tenantId,
                propertyId: olive.id,
                status: "active",
                commercialUnitId: { not: null },
              },
            }),
        );
        const oliveExecs = await withTenantTransaction(
          olive.tenantId,
          async (tx) =>
            tx.cleaningExecution.count({
              where: {
                tenantId: olive.tenantId,
                propertyId: olive.id,
                cleaningLocationId: { not: null },
              },
            }),
        );
        if (oliveLocs < 1 || oliveExecs < 1) {
          throw new Error("Olive migrated history missing");
        }
        results.push(
          `PASS Olive migrated history readable (locations=${oliveLocs}, execs=${oliveExecs})`,
        );
      } else {
        results.push("SKIP Olive read-only check (property not present)");
      }
    } finally {
      await catalog.$disconnect();
    }

    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        { ok: false, ...report, error: String(error) },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    try {
      await withTenantTransaction(TENANT, async (tx) => {
        await tx.cleaningPhoto.deleteMany({ where: { tenantId: TENANT } });
        await tx.cleaningExecutionItem.deleteMany({ where: { tenantId: TENANT } });
        await tx.cleaningExecution.deleteMany({ where: { tenantId: TENANT } });
        await tx.task.deleteMany({ where: { tenantId: TENANT } });
        await tx.unitQrAccess.deleteMany({ where: { tenantId: TENANT } });
        await tx.cleaningLocationQrAccess.deleteMany({
          where: { tenantId: TENANT },
        });
        await tx.cleaningLocationStatus.deleteMany({ where: { tenantId: TENANT } });
        await tx.cleaningLocation.deleteMany({ where: { tenantId: TENANT } });
        await tx.unit.deleteMany({ where: { tenantId: TENANT } });
        await tx.property.deleteMany({ where: { tenantId: TENANT } });
      });
      await withTenantTransaction(TENANT_B, async (tx) => {
        await tx.property.deleteMany({ where: { tenantId: TENANT_B } });
      });
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          cleanupError: String(cleanupError),
          note: "isolated cl-v1 tenant cleanup failed; manual review may be needed",
        }),
      );
    }
    await clearTenantContext(prisma);
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT, TENANT_B] } },
    });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.$disconnect();
  }
}

main();
