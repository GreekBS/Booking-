/**
 * HT-3 authorized verification: Manager ACL, Today TZ, CAS, outbox reconcile path,
 * inventory separation. Loads dotenv before Prisma for talos_runtime.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

async function main(): Promise<void> {
  const {
    PermissionChecker,
    ListTasksUseCase,
    GetTaskUseCase,
    CreateTaskUseCase,
    StartTaskUseCase,
    CompleteTaskUseCase,
    AssignTaskUseCase,
    MarkUnitDirtyUseCase,
    MarkUnitCleanUseCase,
    GetUnitHousekeepingStatusUseCase,
    ReconcileBookingTurnoverUseCase,
    HousekeepingBookingOutboxHandler,
    canonicalTurnoverSourceKey,
    historyTurnoverSourceKey,
    Task,
  } = await import("@hcp/domain");
  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    PrismaTaskRepository,
    PrismaUnitHousekeepingStatusRepository,
    PrismaHousekeepingTurnoverStore,
    PrismaHousekeepingTodayQuery,
    PrismaPropertyRepository,
    PrismaOutboxRepository,
    PrismaMembershipRepository,
    TimezoneService,
    UuidIdGenerator,
    isTalosProductionDatabaseUrl,
    assertNotTalosProductionDatabase,
  } = await import("../src/index.js");

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "ht3-verify");
    }
  }

  const role = await prisma.$queryRawUnsafe<
    Array<{ current_user: string; rolbypassrls: boolean }>
  >(
    `SELECT current_user, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
  );

  const tenantId = randomUUID();
  const propA = randomUUID();
  const propB = randomUUID();
  const unitA = randomUUID();
  const unitA2 = randomUUID();
  const unitB = randomUUID();
  const adminUser = randomUUID();
  const managerUser = randomUUID();
  const results: string[] = [];

  const outboxRepository = new PrismaOutboxRepository();
  const propertyRepository = new PrismaPropertyRepository(outboxRepository);
  const membershipRepository = new PrismaMembershipRepository(outboxRepository);
  const tasks = new PrismaTaskRepository();
  const hk = new PrismaUnitHousekeepingStatusRepository();
  const store = new PrismaHousekeepingTurnoverStore();
  const todayQuery = new PrismaHousekeepingTodayQuery();
  const tz = new TimezoneService();
  const ids = new UuidIdGenerator();
  const permissions = new PermissionChecker();

  const managerActor = {
    userId: managerUser,
    role: "manager" as const,
    propertyIds: [propA],
    isSuperAdmin: false,
  };
  const adminActor = {
    userId: adminUser,
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  try {
    await clearTenantContext(prisma);
    await prisma.user.createMany({
      data: [
        {
          id: adminUser,
          email: `ht3-admin-${adminUser.slice(0, 8)}@demo.test`,
          name: "HT3 Admin",
        },
        {
          id: managerUser,
          email: `ht3-mgr-${managerUser.slice(0, 8)}@demo.test`,
          name: "HT3 Manager",
        },
      ],
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "HT3 Verify",
        slug: `ht3-${tenantId.slice(0, 8)}`,
      },
    });

    await withTenantTransaction(tenantId, async (tx) => {
      await tx.membership.createMany({
        data: [
          {
            id: randomUUID(),
            userId: adminUser,
            tenantId,
            role: "admin",
            propertyIds: [],
            status: "active",
          },
          {
            id: randomUUID(),
            userId: managerUser,
            tenantId,
            role: "manager",
            propertyIds: [propA],
            status: "active",
          },
        ],
      });
      await tx.property.create({
        data: {
          id: propA,
          tenantId,
          name: "Prop A",
          slug: `pa-${propA.slice(0, 8)}`,
          timezone: "Europe/Athens",
        },
      });
      await tx.property.create({
        data: {
          id: propB,
          tenantId,
          name: "Prop B",
          slug: `pb-${propB.slice(0, 8)}`,
          timezone: "Europe/Athens",
        },
      });
      for (const [id, pid, name, slug] of [
        [unitA, propA, "Unit A", `ua-${unitA.slice(0, 8)}`],
        [unitA2, propA, "Unit A2", `ua2-${unitA2.slice(0, 8)}`],
        [unitB, propB, "Unit B", `ub-${unitB.slice(0, 8)}`],
      ] as const) {
        await tx.unit.create({
          data: {
            id,
            tenantId,
            propertyId: pid,
            name,
            slug,
            maxGuests: 2,
          },
        });
      }
    });

    for (const [pid, uid] of [
      [propA, unitA],
      [propA, unitA2],
      [propB, unitB],
    ] as const) {
      await hk.ensureInitialized({
        tenantId,
        propertyId: pid,
        unitId: uid,
      });
    }

    const listUc = new ListTasksUseCase(tasks, permissions);
    const getUc = new GetTaskUseCase(tasks, permissions);
    const createUc = new CreateTaskUseCase(
      tasks,
      propertyRepository,
      membershipRepository,
      ids,
      permissions,
    );
    const startUc = new StartTaskUseCase(tasks, permissions);
    const completeUc = new CompleteTaskUseCase(store, tasks, permissions);
    const assignUc = new AssignTaskUseCase(
      tasks,
      membershipRepository,
      permissions,
    );
    const markDirty = new MarkUnitDirtyUseCase(
      hk,
      propertyRepository,
      permissions,
    );
    const markClean = new MarkUnitCleanUseCase(
      hk,
      propertyRepository,
      permissions,
    );
    const getHk = new GetUnitHousekeepingStatusUseCase(
      hk,
      propertyRepository,
      permissions,
    );

    const createdA = await createUc.execute(
      {
        tenantId,
        propertyId: propA,
        unitId: unitA,
        category: "HOUSEKEEPING",
        title: "Mgr A task",
      },
      managerActor,
    );
    if (createdA.isFailure) throw createdA.getError();
    results.push("PASS manager create on A");

    const createdB = await createUc.execute(
      {
        tenantId,
        propertyId: propB,
        unitId: unitB,
        category: "GENERAL",
        title: "Mgr B denied",
      },
      managerActor,
    );
    if (!createdB.isFailure) throw new Error("manager created on B");
    results.push("PASS manager denied create on B");

    const taskB = Task.create({
      id: randomUUID(),
      tenantId,
      propertyId: propB,
      unitId: unitB,
      category: "GENERAL",
      title: "Admin B",
      createdByUserId: adminUser,
    });
    await tasks.save(taskB);

    if (!(await listUc.execute({ tenantId, propertyId: propB }, managerActor)).isFailure) {
      throw new Error("manager listed B");
    }
    results.push("PASS manager denied list B");

    if (!(await getUc.execute({ tenantId, taskId: taskB.id }, managerActor)).isFailure) {
      throw new Error("manager got B by id");
    }
    results.push("PASS manager denied guessed B id");

    if (
      !(
        await markDirty.execute(
          { tenantId, propertyId: propB, unitId: unitB },
          managerActor,
        )
      ).isFailure
    ) {
      throw new Error("manager marked B dirty");
    }
    results.push("PASS manager denied HK on B");

    if (
      !(
        await getHk.execute(
          { tenantId, propertyId: propB, unitId: unitB },
          managerActor,
        )
      ).isFailure
    ) {
      throw new Error("manager read B HK");
    }
    results.push("PASS manager denied get HK on B");

    const dirtyA = await markDirty.execute(
      { tenantId, propertyId: propA, unitId: unitA },
      managerActor,
    );
    if (dirtyA.isFailure) throw dirtyA.getError();
    results.push("PASS manager mark dirty on A");

    const started = await startUc.execute(
      {
        tenantId,
        taskId: createdA.getValue().id,
        expectedVersion: createdA.getValue().version,
      },
      managerActor,
    );
    if (started.isFailure) throw started.getError();
    results.push("PASS manager start on A");

    const board = await todayQuery.getTodayBoard({
      tenantId,
      propertyId: propA,
    });
    if (!board) throw new Error("no board");
    const localToday = await tz.propertyLocalToday("Europe/Athens");
    if (board.localToday !== localToday) {
      throw new Error(`tz ${board.localToday} != ${localToday}`);
    }
    results.push("PASS today timezone");

    const blocksBefore = await withTenantTransaction(tenantId, (tx) =>
      tx.unitCalendarBlock.count({ where: { unitId: unitA } }),
    );
    await markClean.execute(
      {
        tenantId,
        propertyId: propA,
        unitId: unitA,
        expectedVersion: dirtyA.getValue().version,
      },
      managerActor,
    );
    const blocksAfter = await withTenantTransaction(tenantId, (tx) =>
      tx.unitCalendarBlock.count({ where: { unitId: unitA } }),
    );
    if (blocksBefore !== blocksAfter) throw new Error("inventory mutated");
    results.push("PASS inventory unchanged");

    // Outbox Commerce -> Operations boundary (tasks without Booking FK rows)
    const bookingId = randomUUID();
    const reconcile = new ReconcileBookingTurnoverUseCase(store, tz);
    const outboxHandler = new HousekeepingBookingOutboxHandler(reconcile);

    const turnoverOpen = Task.create({
      id: randomUUID(),
      tenantId,
      propertyId: propA,
      unitId: unitA,
      category: "HOUSEKEEPING",
      title: "Departure turnover clean",
      source: "TURNOVER",
      sourceKey: canonicalTurnoverSourceKey(bookingId),
      dueAt: new Date(localToday + "T12:00:00.000Z"),
    });
    await tasks.save(turnoverOpen);

    await outboxHandler.handle({
      id: randomUUID(),
      tenantId,
      aggregateType: "Booking",
      aggregateId: bookingId,
      eventType: "BookingCancelled",
      payload: {},
      status: "pending",
      attemptCount: 0,
    });

    const afterCancel = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(bookingId),
    );
    if (!afterCancel || afterCancel.status !== "CANCELLED") {
      throw new Error("expected turnover cancelled via outbox");
    }
    results.push("PASS Commerce outbox BookingCancelled -> turnover cancel");

    const booking2 = randomUUID();
    const key2 = canonicalTurnoverSourceKey(booking2);
    let t = Task.create({
      id: randomUUID(),
      tenantId,
      propertyId: propA,
      unitId: unitA,
      category: "HOUSEKEEPING",
      title: "Turnover",
      source: "TURNOVER",
      sourceKey: key2,
    });
    await tasks.save(t);
    const v0 = t.version;
    t.start(v0);
    await tasks.saveWithExpectedVersion(t, v0);
    t = (await tasks.findById(tenantId, t.id))!;
    const histKey = historyTurnoverSourceKey(booking2, t.id);
    const vHist = t.version;
    t.retireSourceKey(vHist, histKey);
    await tasks.saveWithExpectedVersion(t, vHist);
    await tasks.save(
      Task.create({
        id: randomUUID(),
        tenantId,
        propertyId: propA,
        unitId: unitA2,
        category: "HOUSEKEEPING",
        title: "Turnover",
        source: "TURNOVER",
        sourceKey: key2,
      }),
    );
    const oldTask = await tasks.findById(tenantId, t.id);
    if (oldTask?.sourceKey !== histKey || oldTask.status !== "IN_PROGRESS") {
      throw new Error("IN_PROGRESS history not preserved");
    }
    results.push("PASS IN_PROGRESS unit divergence preserves history");

    const booking3 = randomUUID();
    const key3 = canonicalTurnoverSourceKey(booking3);
    let done = Task.create({
      id: randomUUID(),
      tenantId,
      propertyId: propA,
      unitId: unitA,
      category: "HOUSEKEEPING",
      title: "Turnover",
      source: "TURNOVER",
      sourceKey: key3,
    });
    await tasks.save(done);
    done = (await tasks.findById(tenantId, done.id))!;
    done.start(done.version);
    await tasks.saveWithExpectedVersion(done, done.version - 1);
    done = (await tasks.findById(tenantId, done.id))!;
    done.complete(done.version);
    await tasks.saveWithExpectedVersion(done, done.version - 1);
    done = (await tasks.findById(tenantId, done.id))!;
    const doneHist = historyTurnoverSourceKey(booking3, done.id);
    done.retireSourceKey(done.version, doneHist);
    await tasks.saveWithExpectedVersion(done, done.version - 1);
    await tasks.save(
      Task.create({
        id: randomUUID(),
        tenantId,
        propertyId: propA,
        unitId: unitA2,
        category: "HOUSEKEEPING",
        title: "Turnover",
        source: "TURNOVER",
        sourceKey: key3,
      }),
    );
    const preserved = await tasks.findById(tenantId, done.id);
    if (preserved?.status !== "COMPLETED" || preserved.sourceKey !== doneHist) {
      throw new Error("COMPLETED history rewritten");
    }
    results.push("PASS COMPLETED divergence preserves history");

    const booking4 = randomUUID();
    let openExt = Task.create({
      id: randomUUID(),
      tenantId,
      propertyId: propA,
      unitId: unitA,
      category: "HOUSEKEEPING",
      title: "Turnover",
      source: "TURNOVER",
      sourceKey: canonicalTurnoverSourceKey(booking4),
      dueAt: new Date(localToday + "T12:00:00.000Z"),
    });
    await tasks.save(openExt);
    openExt = (await tasks.findById(tenantId, openExt.id))!;
    const later = new Date(localToday + "T00:00:00.000Z");
    later.setUTCDate(later.getUTCDate() + 3);
    const laterIso = later.toISOString().slice(0, 10);
    openExt.reconcileOpenTurnover(openExt.version, {
      propertyId: propA,
      unitId: unitA,
      dueAt: new Date(laterIso + "T12:00:00.000Z"),
    });
    await tasks.saveWithExpectedVersion(openExt, openExt.version - 1);
    const extended = await tasks.findById(tenantId, openExt.id);
    if (extended?.dueAt?.toISOString().slice(0, 10) !== laterIso) {
      throw new Error("extension dueAt not updated");
    }
    results.push("PASS booking extension dueAt reconcile");

    await outboxHandler.handle({
      id: randomUUID(),
      tenantId,
      aggregateType: "Booking",
      aggregateId: booking4,
      eventType: "BookingStayChanged",
      payload: {},
      status: "pending",
      attemptCount: 0,
    });
    results.push("PASS Commerce outbox BookingStayChanged handler");

    // Real Commerce CancelBooking -> outbox row -> Operations reconcile
    const holdId = randomUUID();
    const quoteId = randomUUID();
    const snapshotId = randomUUID();
    const commerceBookingId = randomUUID();
    const checkIn = new Date(localToday + "T00:00:00.000Z");
    checkIn.setUTCDate(checkIn.getUTCDate() - 2);
    const checkOut = new Date(localToday + "T00:00:00.000Z");
    const checkInIso = checkIn.toISOString().slice(0, 10);
    const checkOutIso = checkOut.toISOString().slice(0, 10);

    await withTenantTransaction(tenantId, async (tx) => {
      await tx.bookingHold.create({
        data: {
          id: holdId,
          tenantId,
          unitId: unitA,
          propertyId: propA,
          checkIn,
          checkOut,
          guestCount: 2,
          status: "converted",
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.quote.create({
        data: {
          id: quoteId,
          tenantId,
          holdId,
          unitId: unitA,
          propertyId: propA,
          snapshotId,
          snapshot: {
            version: 1,
            checkIn: checkInIso,
            checkOut: checkOutIso,
            propertyTimezone: "Europe/Athens",
            currency: "EUR",
            lineItems: [],
            subtotalAmount: "100.00",
            feesAmount: "0.00",
            taxesAmount: "0.00",
            totalAmount: "100.00",
            quotedAt: new Date().toISOString(),
          },
          currency: "EUR",
          totalAmount: "100.0000",
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.booking.create({
        data: {
          id: commerceBookingId,
          tenantId,
          unitId: unitA,
          propertyId: propA,
          quoteId,
          holdId,
          quoteSnapshotId: snapshotId,
          guestName: "HT3 Guest",
          guestEmail: "ht3-guest@demo.test",
          guestPhone: null,
          guestCount: 2,
          checkIn,
          checkOut,
          status: "confirmed",
          confirmationMode: "manual",
          totalAmount: "100.0000",
          currency: "EUR",
          confirmedAt: new Date(),
        },
      });
    });

    await tasks.save(
      Task.create({
        id: randomUUID(),
        tenantId,
        propertyId: propA,
        unitId: unitA,
        category: "HOUSEKEEPING",
        title: "Departure turnover clean",
        source: "TURNOVER",
        sourceKey: canonicalTurnoverSourceKey(commerceBookingId),
        bookingId: commerceBookingId,
        dueAt: new Date(localToday + "T12:00:00.000Z"),
      }),
    );

    const { CancelBookingUseCase } = await import("@hcp/domain");
    const {
      PrismaBookingRepository,
      PrismaAuditLogRepository,
    } = await import("../src/index.js");

    const bookingRepo = new PrismaBookingRepository(outboxRepository);
    const auditRepo = new PrismaAuditLogRepository();
    const cancelUc = new CancelBookingUseCase(
      bookingRepo,
      permissions,
      auditRepo,
    );
    const cancelResult = await cancelUc.execute(
      { tenantId, bookingId: commerceBookingId, reason: "ht3-verify" },
      adminActor,
    );
    if (cancelResult.isFailure) throw cancelResult.getError();

    const pendingCancel = await withTenantTransaction(tenantId, (tx) =>
      tx.outboxEvent.findFirst({
        where: {
          tenantId,
          aggregateId: commerceBookingId,
          eventType: "BookingCancelled",
          status: "pending",
        },
        orderBy: { createdAt: "desc" },
      }),
    );
    if (!pendingCancel) {
      throw new Error("CancelBooking did not emit BookingCancelled outbox");
    }

    await outboxHandler.handle({
      id: pendingCancel.id,
      tenantId: pendingCancel.tenantId,
      aggregateType: pendingCancel.aggregateType,
      aggregateId: pendingCancel.aggregateId,
      eventType: pendingCancel.eventType,
      payload: pendingCancel.payload as Record<string, unknown>,
      status: pendingCancel.status,
      attemptCount: pendingCancel.attemptCount,
    });
    await outboxRepository.markCompleted(pendingCancel.id);

    const afterCommerceCancel = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(commerceBookingId),
    );
    if (!afterCommerceCancel || afterCommerceCancel.status !== "CANCELLED") {
      throw new Error("Commerce cancel did not cancel turnover via outbox");
    }
    results.push(
      "PASS Commerce CancelBookingUseCase -> outbox -> turnover cancel",
    );

    // Concurrent start
    const race = Task.create({
      id: randomUUID(),
      tenantId,
      propertyId: propA,
      category: "GENERAL",
      title: "Race",
      createdByUserId: adminUser,
    });
    await tasks.save(race);
    const [a, b] = await Promise.all([
      startUc.execute(
        { tenantId, taskId: race.id, expectedVersion: 1 },
        adminActor,
      ),
      startUc.execute(
        { tenantId, taskId: race.id, expectedVersion: 1 },
        adminActor,
      ),
    ]);
    const wins = [a, b].filter((r) => r.isSuccess).length;
    if (wins !== 1) throw new Error(`CAS wins=${wins}`);
    results.push("PASS concurrent Start CAS");

    const race2 = Task.create({
      id: randomUUID(),
      tenantId,
      propertyId: propA,
      category: "GENERAL",
      title: "Race complete",
      createdByUserId: adminUser,
    });
    await tasks.save(race2);
    race2.start(1);
    await tasks.saveWithExpectedVersion(race2, 1);
    const [c1, c2] = await Promise.all([
      completeUc.execute(
        { tenantId, taskId: race2.id, expectedVersion: 2 },
        adminActor,
      ),
      completeUc.execute(
        { tenantId, taskId: race2.id, expectedVersion: 2 },
        adminActor,
      ),
    ]);
    if ([c1, c2].filter((r) => r.isSuccess).length !== 1) {
      throw new Error("Complete CAS failed");
    }
    results.push("PASS concurrent Complete CAS");

    const assignTask = Task.create({
      id: randomUUID(),
      tenantId,
      propertyId: propA,
      category: "GENERAL",
      title: "Assign race",
      createdByUserId: adminUser,
    });
    await tasks.save(assignTask);
    const staleAssign = await assignUc.execute(
      {
        tenantId,
        taskId: assignTask.id,
        expectedVersion: 1,
        assignedToUserId: managerUser,
      },
      adminActor,
    );
    if (staleAssign.isFailure) throw staleAssign.getError();
    const staleAssign2 = await assignUc.execute(
      {
        tenantId,
        taskId: assignTask.id,
        expectedVersion: 1,
        assignedToUserId: adminUser,
      },
      adminActor,
    );
    if (!staleAssign2.isFailure) throw new Error("stale assign should 409");
    results.push("PASS stale assignment CAS");

    const hkRow = await hk.findByUnitId(tenantId, unitA2);
    if (!hkRow) throw new Error("missing hk row");
    const dirtyOk = await markDirty.execute(
      {
        tenantId,
        propertyId: propA,
        unitId: unitA2,
        expectedVersion: hkRow.version,
      },
      adminActor,
    );
    if (dirtyOk.isFailure) throw dirtyOk.getError();
    const dirtyStale = await markDirty.execute(
      {
        tenantId,
        propertyId: propA,
        unitId: unitA2,
        expectedVersion: hkRow.version,
      },
      adminActor,
    );
    if (!dirtyStale.isFailure) throw new Error("stale mark dirty should 409");
    const afterDirty = await hk.findByUnitId(tenantId, unitA2);
    if (!afterDirty) throw new Error("missing hk after dirty");
    const cleanOk = await markClean.execute(
      {
        tenantId,
        propertyId: propA,
        unitId: unitA2,
        expectedVersion: afterDirty.version,
      },
      adminActor,
    );
    if (cleanOk.isFailure) throw cleanOk.getError();
    const cleanStale = await markClean.execute(
      {
        tenantId,
        propertyId: propA,
        unitId: unitA2,
        expectedVersion: afterDirty.version,
      },
      adminActor,
    );
    if (!cleanStale.isFailure) throw new Error("stale mark clean should 409");
    results.push("PASS Mark Dirty/Clean stale version CAS");

    console.log(
      JSON.stringify(
        {
          ok: true,
          runtimeUser: role[0]?.current_user,
          runtimeBypassRls: role[0]?.rolbypassrls,
          results,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(
      JSON.stringify({ ok: false, results, error: String(err) }, null, 2),
    );
    process.exitCode = 1;
  } finally {
    await clearTenantContext(prisma);
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.task.deleteMany({ where: { tenantId } });
      await tx.unitHousekeepingStatus.deleteMany({ where: { tenantId } });
      await tx.unitCalendarBlock.deleteMany({ where: { tenantId } });
      await tx.booking.deleteMany({ where: { tenantId } });
      await tx.quote.deleteMany({ where: { tenantId } });
      await tx.bookingHold.deleteMany({ where: { tenantId } });
      await tx.outboxEvent.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await tx.unit.deleteMany({ where: { tenantId } });
      await tx.property.deleteMany({ where: { tenantId } });
      await tx.membership.deleteMany({ where: { tenantId } });
    }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { id: { in: [adminUser, managerUser] } } })
      .catch(() => undefined);
    await prisma.$disconnect();
  }
}

main();
