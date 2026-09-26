/**
 * HT-1/HT-2 authorized verification against demo DB.
 * IMPORTANT: load dotenv BEFORE importing @hcp/database so Prisma binds
 * RUNTIME_DATABASE_URL (talos_runtime, non-BYPASSRLS).
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

async function main(): Promise<void> {
  const { Task, canonicalTurnoverSourceKey } = await import("@hcp/domain");
  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    PrismaTaskRepository,
    PrismaUnitHousekeepingStatusRepository,
    PrismaHousekeepingTurnoverStore,
    isTalosProductionDatabaseUrl,
    assertNotTalosProductionDatabase,
  } = await import("../src/index.js");

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "ht12-verify");
    }
  }

  const role = await prisma.$queryRawUnsafe<
    Array<{ current_user: string; rolbypassrls: boolean }>
  >(
    `SELECT current_user, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
  );

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userId = randomUUID();
  const propA = randomUUID();
  const unitA = randomUUID();
  const bookingId = randomUUID();
  const results: string[] = [];

  const report = {
    runtimeUser: role[0]?.current_user,
    runtimeBypassRls: role[0]?.rolbypassrls,
    results,
  };

  try {
    await clearTenantContext(prisma);
    await prisma.user.create({
      data: {
        id: userId,
        email: `ht12-${userId.slice(0, 8)}@demo.test`,
        name: "HT12 Verifier",
      },
    });
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: "HT12 A", slug: `ht12-a-${tenantA.slice(0, 8)}` },
        { id: tenantB, name: "HT12 B", slug: `ht12-b-${tenantB.slice(0, 8)}` },
      ],
    });

    await withTenantTransaction(tenantA, async (tx) => {
      await tx.property.create({
        data: {
          id: propA,
          tenantId: tenantA,
          name: "Prop A",
          slug: `pa-${propA.slice(0, 8)}`,
          timezone: "Europe/Athens",
        },
      });
      await tx.unit.create({
        data: {
          id: unitA,
          tenantId: tenantA,
          propertyId: propA,
          name: "Unit A",
          slug: `ua-${unitA.slice(0, 8)}`,
          maxGuests: 2,
        },
      });
    });

    const hkRepo = new PrismaUnitHousekeepingStatusRepository();
    const taskRepo = new PrismaTaskRepository();
    const store = new PrismaHousekeepingTurnoverStore();

    const hk = await hkRepo.ensureInitialized({
      tenantId: tenantA,
      propertyId: propA,
      unitId: unitA,
    });
    if (hk.status !== "CLEAN") throw new Error("expected CLEAN init");
    results.push("PASS init CLEAN");

    const task = Task.create({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propA,
      unitId: unitA,
      category: "HOUSEKEEPING",
      title: "Manual clean",
      createdByUserId: userId,
    });
    await taskRepo.save(task);
    const v1 = task.version;
    task.start(v1);
    await taskRepo.saveWithExpectedVersion(task, v1);

    let conflict = false;
    try {
      const stale = await taskRepo.findById(tenantA, task.id);
      if (!stale) throw new Error("missing");
      stale.start(v1);
      await taskRepo.saveWithExpectedVersion(stale, v1);
    } catch {
      conflict = true;
    }
    if (!conflict) throw new Error("expected CAS conflict");
    results.push("PASS task CAS start conflict");

    await withTenantTransaction(tenantB, async (tx) => {
      const n = await tx.task.count({ where: { tenantId: tenantA } });
      if (n !== 0) throw new Error("tenant B saw tenant A tasks");
    });
    results.push("PASS RLS task isolation");

    await clearTenantContext(prisma);
    const leaked = await prisma.task.count({ where: { tenantId: tenantA } });
    if (role[0]?.rolbypassrls === false && leaked !== 0) {
      throw new Error(`missing tenant context leaked ${leaked} rows`);
    }
    results.push(
      role[0]?.rolbypassrls
        ? `INFO missing-context count=${leaked} (BYPASSRLS role)`
        : "PASS missing tenant context fails closed",
    );

    const blocksBefore = await withTenantTransaction(tenantA, async (tx) =>
      tx.unitCalendarBlock.count({ where: { unitId: unitA } }),
    );
    let hkDirty = await hkRepo.findByUnitId(tenantA, unitA);
    if (!hkDirty) throw new Error("missing hk");
    const dirtyExpected = hkDirty.version;
    hkDirty.markDirty(dirtyExpected, "MANUAL", userId);
    await hkRepo.saveWithExpectedVersion(hkDirty, dirtyExpected);
    const blocksAfter = await withTenantTransaction(tenantA, async (tx) =>
      tx.unitCalendarBlock.count({ where: { unitId: unitA } }),
    );
    if (blocksBefore !== blocksAfter) {
      throw new Error("DIRTY mutated inventory");
    }
    results.push("PASS inventory unchanged on DIRTY");

    const sourceKey = canonicalTurnoverSourceKey(bookingId);
    await taskRepo.save(
      Task.create({
        id: randomUUID(),
        tenantId: tenantA,
        propertyId: propA,
        unitId: unitA,
        category: "HOUSEKEEPING",
        title: "Turnover",
        source: "TURNOVER",
        sourceKey,
      }),
    );
    let dup = false;
    try {
      await taskRepo.save(
        Task.create({
          id: randomUUID(),
          tenantId: tenantA,
          propertyId: propA,
          unitId: unitA,
          category: "HOUSEKEEPING",
          title: "Turnover",
          source: "TURNOVER",
          sourceKey,
        }),
      );
    } catch {
      dup = true;
    }
    if (!dup) throw new Error("expected unique source_key");
    results.push("PASS unique turnover sourceKey");

    const open = await taskRepo.findById(tenantA, task.id);
    if (!open || open.status !== "IN_PROGRESS") {
      throw new Error("expected IN_PROGRESS");
    }
    const done = await store.completeHousekeepingTask({
      tenantId: tenantA,
      taskId: open.id,
      expectedVersion: open.version,
      actorUserId: userId,
    });
    if (done.housekeeping?.status !== "CLEAN") {
      throw new Error("complete should CLEAN");
    }
    results.push("PASS complete → CLEAN");

    const reopened = await store.reopenHousekeepingTask({
      tenantId: tenantA,
      taskId: done.task.id,
      expectedVersion: done.task.version,
      actorUserId: userId,
    });
    if (reopened.housekeeping?.status !== "DIRTY") {
      throw new Error("reopen should DIRTY");
    }
    results.push("PASS reopen → DIRTY");

    if (role[0]?.current_user === "talos_runtime" && role[0]?.rolbypassrls === false) {
      results.push("PASS runtime role is talos_runtime non-BYPASSRLS");
    } else {
      results.push(
        `WARN runtime role=${role[0]?.current_user} bypass=${role[0]?.rolbypassrls}`,
      );
    }

    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, ...report, error: String(err) }, null, 2));
    process.exitCode = 1;
  } finally {
    await clearTenantContext(prisma);
    await withTenantTransaction(tenantA, async (tx) => {
      await tx.task.deleteMany({ where: { tenantId: tenantA } });
      await tx.unitHousekeepingStatus.deleteMany({ where: { tenantId: tenantA } });
      await tx.unit.deleteMany({ where: { tenantId: tenantA } });
      await tx.property.deleteMany({ where: { tenantId: tenantA } });
    }).catch(() => undefined);
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main();
