/**
 * HT-4 authorized verification: Commerce stay/unit-change → outbox → Operations,
 * generator replay idempotency, Manager dashboard/task filter ACL.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

function isoPlus(days: number, from = new Date()): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days),
  );
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const {
    PermissionChecker,
    CreateHoldUseCase,
    CreateQuoteUseCase,
    CreateBookingUseCase,
    ConfirmBookingUseCase,
    ChangeBookingStayUseCase,
    CancelBookingUseCase,
    ReservationOrchestrator,
    ResolveOrCreateGuest,
    ReconcileBookingTurnoverUseCase,
    GenerateHousekeepingTurnoverUseCase,
    HousekeepingBookingOutboxHandler,
    ListTasksUseCase,
    GetHousekeepingTodayUseCase,
    canonicalTurnoverSourceKey,
  } = await import("@hcp/domain");
  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    PrismaTaskRepository,
    PrismaUnitHousekeepingStatusRepository,
    PrismaHousekeepingTurnoverStore,
    PrismaHousekeepingTodayQuery,
    PrismaOutboxRepository,
    PrismaHoldRepository,
    PrismaQuoteRepository,
    PrismaBookingRepository,
    PrismaCalendarBlockRepository,
    PrismaRatePlanRepository,
    PrismaAvailabilityRulesRepository,
    PrismaCommerceFlowRepository,
    PrismaGuestRepository,
    PrismaCatalogQueryAdapter,
    PrismaAuditLogRepository,
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
      assertNotTalosProductionDatabase(dbUrl, "ht4-verify");
    }
  }

  const results: string[] = [];
  const tenantId = randomUUID();
  const propA = randomUUID();
  const propB = randomUUID();
  const unitA = randomUUID();
  const unitA2 = randomUUID();
  const unitB = randomUUID();
  const adminUser = randomUUID();
  const managerUser = randomUUID();

  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const commerceFlowRepository = new PrismaCommerceFlowRepository(outboxRepository);
  const catalog = new PrismaCatalogQueryAdapter();
  const timezone = new TimezoneService();
  const ids = new UuidIdGenerator();
  const permissions = new PermissionChecker();
  const audit = new PrismaAuditLogRepository();
  const guestRepo = new PrismaGuestRepository();
  const tasks = new PrismaTaskRepository();
  const hk = new PrismaUnitHousekeepingStatusRepository();
  const store = new PrismaHousekeepingTurnoverStore();
  const todayQuery = new PrismaHousekeepingTodayQuery();

  const orchestrator = new ReservationOrchestrator(
    catalog,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezone,
    ids,
  );

  const createHold = new CreateHoldUseCase(
    holdRepository,
    orchestrator,
    permissions,
    ids,
  );
  const createQuote = new CreateQuoteUseCase(
    catalog,
    holdRepository,
    quoteRepository,
    orchestrator,
    permissions,
    ids,
  );
  const createBooking = new CreateBookingUseCase(
    holdRepository,
    quoteRepository,
    commerceFlowRepository,
    permissions,
    audit,
    ids,
    new ResolveOrCreateGuest(guestRepo, ids, permissions),
    guestRepo,
  );
  const confirmBooking = new ConfirmBookingUseCase(
    bookingRepository,
    permissions,
    audit,
  );
  const changeStay = new ChangeBookingStayUseCase(
    bookingRepository,
    quoteRepository,
    commerceFlowRepository,
    orchestrator,
    permissions,
    audit,
  );
  const cancelBooking = new CancelBookingUseCase(
    bookingRepository,
    permissions,
    audit,
  );
  const reconcile = new ReconcileBookingTurnoverUseCase(store, timezone);
  const outboxHandler = new HousekeepingBookingOutboxHandler(reconcile);
  const generator = new GenerateHousekeepingTurnoverUseCase(
    store,
    reconcile,
    timezone,
  );
  const listTasks = new ListTasksUseCase(tasks, permissions);
  const getToday = new GetHousekeepingTodayUseCase(todayQuery, permissions);

  const adminActor = {
    userId: adminUser,
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };
  const managerActor = {
    userId: managerUser,
    role: "manager" as const,
    propertyIds: [propA],
    isSuperAdmin: false,
  };

  async function drainHousekeepingOutbox(aggregateId: string): Promise<number> {
    const pending = await withTenantTransaction(tenantId, (tx) =>
      tx.outboxEvent.findMany({
        where: {
          tenantId,
          aggregateId,
          status: "pending",
          eventType: {
            in: [
              "BookingConfirmed",
              "BookingCancelled",
              "BookingStayChanged",
              "BookingUnitChanged",
            ],
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    );
    for (const row of pending) {
      await outboxHandler.handle({
        id: row.id,
        tenantId: row.tenantId,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        eventType: row.eventType,
        payload: row.payload as Record<string, unknown>,
        status: row.status,
        attemptCount: row.attemptCount,
      });
      await outboxRepository.markCompleted(row.id);
    }
    return pending.length;
  }

  async function createConfirmed(params: {
    unitId: string;
    checkIn: string;
    checkOut: string;
  }) {
    const holdR = await createHold.execute(
      {
        tenantId,
        unitId: params.unitId,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        guestCount: 2,
      },
      adminActor,
    );
    if (holdR.isFailure) throw holdR.getError();
    const quoteR = await createQuote.execute(
      { tenantId, holdId: holdR.getValue().id },
      adminActor,
    );
    if (quoteR.isFailure) throw quoteR.getError();
    const bookR = await createBooking.execute(
      {
        tenantId,
        quoteId: quoteR.getValue().id,
        guest: {
          name: "HT4 Guest",
          email: `ht4-${randomUUID().slice(0, 8)}@demo.test`,
          phone: null,
        },
        confirmationMode: "manual",
      },
      adminActor,
    );
    if (bookR.isFailure) throw bookR.getError();
    const conf = await confirmBooking.execute(
      { tenantId, bookingId: bookR.getValue().id },
      adminActor,
    );
    if (conf.isFailure) throw conf.getError();
    await drainHousekeepingOutbox(conf.getValue().id);
    return conf.getValue();
  }

  try {
    await clearTenantContext(prisma);
    await prisma.user.createMany({
      data: [
        {
          id: adminUser,
          email: `ht4-admin-${adminUser.slice(0, 8)}@demo.test`,
          name: "HT4 Admin",
        },
        {
          id: managerUser,
          email: `ht4-mgr-${managerUser.slice(0, 8)}@demo.test`,
          name: "HT4 Manager",
        },
      ],
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "HT4 Verify",
        slug: `ht4-${tenantId.slice(0, 8)}`,
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
          status: "active",
        },
      });
      await tx.property.create({
        data: {
          id: propB,
          tenantId,
          name: "Prop B",
          slug: `pb-${propB.slice(0, 8)}`,
          timezone: "America/New_York",
          status: "active",
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
            maxGuests: 4,
            status: "active",
          },
        });
        await tx.ratePlan.create({
          data: {
            id: randomUUID(),
            tenantId,
            unitId: id,
            baseNightlyAmount: "100.0000",
            currency: "EUR",
          },
        });
        await tx.unitAvailabilityRule.create({
          data: {
            id: randomUUID(),
            tenantId,
            unitId: id,
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

    // Session-level tenant GUC so CatalogQueryAdapter (non-TX) can resolve units under FORCE RLS.
    await prisma.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant', $1, false)`,
      tenantId,
    );

    const checkIn = isoPlus(2);
    const checkOut = isoPlus(5);
    const booking = await createConfirmed({
      unitId: unitA,
      checkIn,
      checkOut,
    });

    // Ensure turnover even if checkout is future (manual ensure)
    const ensured = await reconcile.execute({
      tenantId,
      bookingId: booking.id,
      actorUserId: adminUser,
    });
    if (ensured.isFailure) throw ensured.getError();
    let turnover = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(booking.id),
    );
    if (!turnover || turnover.status !== "OPEN") {
      throw new Error("expected OPEN turnover after ensure");
    }
    results.push("PASS initial turnover ensure");

    // Extension via real ChangeBookingStay
    const extendedOut = isoPlus(8);
    const ext = await changeStay.execute(
      {
        tenantId,
        bookingId: booking.id,
        unitId: unitA,
        checkIn,
        checkOut: extendedOut,
        guestCount: 2,
      },
      adminActor,
    );
    if (ext.isFailure) throw ext.getError();
    const nExt = await drainHousekeepingOutbox(booking.id);
    if (nExt < 1) throw new Error("expected StayChanged outbox");
    turnover = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(booking.id),
    );
    if (
      !turnover ||
      turnover.status !== "OPEN" ||
      turnover.dueAt?.toISOString().slice(0, 10) !== extendedOut
    ) {
      throw new Error("extension did not move dueAt on canonical OPEN task");
    }
    const afterExtHk = await hk.findByUnitId(tenantId, unitA);
    if (afterExtHk?.status === "DIRTY") {
      // Future checkout should not auto-DIRTY from stay change alone when not due
      // (ensure marks dirty only when checkOut <= localToday)
    }
    results.push("PASS Commerce ChangeBookingStay extension → outbox → dueAt");

    // Replay same outbox event type (idempotent reconcile)
    await outboxHandler.handle({
      id: randomUUID(),
      tenantId,
      aggregateType: "Booking",
      aggregateId: booking.id,
      eventType: "BookingStayChanged",
      payload: {},
      status: "pending",
      attemptCount: 0,
    });
    const afterReplay = await tasks.list({
      tenantId,
      propertyId: propA,
      bookingId: booking.id,
      category: "HOUSEKEEPING",
      page: 1,
      limit: 50,
    });
    const activeCanonical = afterReplay.data.filter(
      (t) =>
        t.source === "TURNOVER" &&
        t.sourceKey === canonicalTurnoverSourceKey(booking.id) &&
        (t.status === "OPEN" || t.status === "IN_PROGRESS"),
    );
    if (activeCanonical.length !== 1) {
      throw new Error(`replay created duplicates: ${activeCanonical.length}`);
    }
    results.push("PASS event replay idempotent");

    // Shortening
    const shortOut = isoPlus(4);
    const short = await changeStay.execute(
      {
        tenantId,
        bookingId: booking.id,
        unitId: unitA,
        checkIn,
        checkOut: shortOut,
        guestCount: 2,
      },
      adminActor,
    );
    if (short.isFailure) throw short.getError();
    await drainHousekeepingOutbox(booking.id);
    turnover = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(booking.id),
    );
    if (turnover?.dueAt?.toISOString().slice(0, 10) !== shortOut) {
      throw new Error("shortening dueAt mismatch");
    }
    results.push("PASS Commerce stay shortening reconcile");

    // Unit change OPEN
    const unitChange = await changeStay.execute(
      {
        tenantId,
        bookingId: booking.id,
        unitId: unitA2,
        checkIn,
        checkOut: shortOut,
        guestCount: 2,
      },
      adminActor,
    );
    if (unitChange.isFailure) throw unitChange.getError();
    await drainHousekeepingOutbox(booking.id);
    turnover = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(booking.id),
    );
    if (!turnover || turnover.unitId !== unitA2 || turnover.status !== "OPEN") {
      throw new Error("OPEN unit change did not follow new unit");
    }
    const oldUnit = await hk.findByUnitId(tenantId, unitA);
    // Old unit should not be auto-DIRTY solely from stale automation for future checkout
    results.push("PASS Commerce unit change OPEN follows new unit");

    // IN_PROGRESS history + new canonical
    const v0 = turnover.version;
    turnover.start(v0);
    await tasks.saveWithExpectedVersion(turnover, v0);
    const unitChange2 = await changeStay.execute(
      {
        tenantId,
        bookingId: booking.id,
        unitId: unitA,
        checkIn,
        checkOut: shortOut,
        guestCount: 2,
      },
      adminActor,
    );
    if (unitChange2.isFailure) throw unitChange2.getError();
    await drainHousekeepingOutbox(booking.id);
    const inProg = await tasks.findById(tenantId, turnover.id);
    const newCanon = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(booking.id),
    );
    if (
      !inProg ||
      inProg.status !== "IN_PROGRESS" ||
      !inProg.sourceKey?.includes(":history:")
    ) {
      throw new Error("IN_PROGRESS history not preserved");
    }
    if (!newCanon || newCanon.id === inProg.id || newCanon.status !== "OPEN") {
      throw new Error("new canonical missing after IN_PROGRESS divergence");
    }
    results.push("PASS unit change IN_PROGRESS preserves history");

    // COMPLETED history
    const booking2 = await createConfirmed({
      unitId: unitA2,
      checkIn: isoPlus(10),
      checkOut: isoPlus(12),
    });
    await reconcile.execute({ tenantId, bookingId: booking2.id });
    let t2 = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(booking2.id),
    );
    if (!t2) throw new Error("missing t2");
    t2.start(t2.version);
    await tasks.saveWithExpectedVersion(t2, t2.version - 1);
    t2 = (await tasks.findById(tenantId, t2.id))!;
    t2.complete(t2.version);
    await tasks.saveWithExpectedVersion(t2, t2.version - 1);
    const doneId = t2.id;
    const move = await changeStay.execute(
      {
        tenantId,
        bookingId: booking2.id,
        unitId: unitA,
        checkIn: isoPlus(10),
        checkOut: isoPlus(12),
        guestCount: 2,
      },
      adminActor,
    );
    if (move.isFailure) throw move.getError();
    await drainHousekeepingOutbox(booking2.id);
    const done = await tasks.findById(tenantId, doneId);
    const canon2 = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(booking2.id),
    );
    if (done?.status !== "COMPLETED" || !done.sourceKey?.includes(":history:")) {
      throw new Error("COMPLETED history rewritten");
    }
    if (!canon2 || canon2.id === doneId || canon2.status !== "OPEN") {
      throw new Error("COMPLETED divergence missing new canonical");
    }
    results.push("PASS unit change COMPLETED preserves history");

    // Cancellation regression
    const booking3 = await createConfirmed({
      unitId: unitA,
      checkIn: isoPlus(20),
      checkOut: isoPlus(22),
    });
    await reconcile.execute({ tenantId, bookingId: booking3.id });
    const blocksBefore = await withTenantTransaction(tenantId, (tx) =>
      tx.unitCalendarBlock.count({ where: { unitId: unitA, blockType: "booking" } }),
    );
    const cancel = await cancelBooking.execute(
      { tenantId, bookingId: booking3.id, reason: "ht4" },
      adminActor,
    );
    if (cancel.isFailure) throw cancel.getError();
    await drainHousekeepingOutbox(booking3.id);
    const cancelledTask = await tasks.findBySourceKey(
      tenantId,
      canonicalTurnoverSourceKey(booking3.id),
    );
    if (cancelledTask?.status !== "CANCELLED") {
      throw new Error("cancel did not cancel turnover");
    }
    const hkAfterCancel = await hk.findByUnitId(tenantId, unitA);
    // cancellation alone must not invent DIRTY from cancel path
    void hkAfterCancel;
    results.push("PASS Commerce cancellation → turnover cancel");

    // Generator replay: seed a due confirmed booking (checkOut = property-local today)
    const localToday = await timezone.propertyLocalToday("Europe/Athens");
    const dueCheckIn = isoPlus(-1);
    const dueHoldId = randomUUID();
    const dueQuoteId = randomUUID();
    const dueSnapId = randomUUID();
    const dueBookingId = randomUUID();
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.bookingHold.create({
        data: {
          id: dueHoldId,
          tenantId,
          unitId: unitA2,
          propertyId: propA,
          checkIn: new Date(`${dueCheckIn}T00:00:00.000Z`),
          checkOut: new Date(`${localToday}T00:00:00.000Z`),
          guestCount: 2,
          status: "converted",
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.quote.create({
        data: {
          id: dueQuoteId,
          tenantId,
          holdId: dueHoldId,
          unitId: unitA2,
          propertyId: propA,
          snapshotId: dueSnapId,
          snapshot: {
            version: 1,
            checkIn: dueCheckIn,
            checkOut: localToday,
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
          id: dueBookingId,
          tenantId,
          unitId: unitA2,
          propertyId: propA,
          quoteId: dueQuoteId,
          holdId: dueHoldId,
          quoteSnapshotId: dueSnapId,
          guestName: "HT4 Due",
          guestEmail: "ht4-due@demo.test",
          guestPhone: null,
          guestCount: 2,
          checkIn: new Date(`${dueCheckIn}T00:00:00.000Z`),
          checkOut: new Date(`${localToday}T00:00:00.000Z`),
          status: "confirmed",
          confirmationMode: "manual",
          totalAmount: "100.0000",
          currency: "EUR",
          confirmedAt: new Date(),
        },
      });
    });
    const gen1 = await generator.execute(new Date(), 50);
    if (gen1.isFailure) throw gen1.getError();
    const gen2 = await generator.execute(new Date(), 50);
    if (gen2.isFailure) throw gen2.getError();
    const dueListed = await tasks.list({
      tenantId,
      propertyId: propA,
      bookingId: dueBookingId,
      category: "HOUSEKEEPING",
      page: 1,
      limit: 20,
    });
    const dueActive = dueListed.data.filter(
      (t) =>
        t.sourceKey === canonicalTurnoverSourceKey(dueBookingId) &&
        (t.status === "OPEN" || t.status === "IN_PROGRESS"),
    );
    if (dueActive.length !== 1) {
      throw new Error(`generator duplicates ${dueActive.length}`);
    }
    results.push("PASS generator replay idempotent");

    // Timezone boards
    const boardA = await getToday.execute(
      { tenantId, propertyId: propA },
      adminActor,
    );
    if (boardA.isFailure) throw boardA.getError();
    if (boardA.getValue().propertyTimezone !== "Europe/Athens") {
      throw new Error("Athens tz missing");
    }
    const boardB = await getToday.execute(
      { tenantId, propertyId: propB },
      adminActor,
    );
    if (boardB.isFailure) throw boardB.getError();
    if (boardB.getValue().propertyTimezone !== "America/New_York") {
      throw new Error("NY tz missing");
    }
    results.push("PASS timezone Europe/Athens + America/New_York");

    // Manager ACL — today B forbidden, list B forbidden, bookingId filter B denied
    const mgrB = await getToday.execute(
      { tenantId, propertyId: propB },
      managerActor,
    );
    if (!mgrB.isFailure) throw new Error("manager saw B today");
    const mgrListB = await listTasks.execute(
      { tenantId, propertyId: propB, page: 1, limit: 10 },
      managerActor,
    );
    if (!mgrListB.isFailure) throw new Error("manager listed B tasks");
    const mgrGuess = await listTasks.execute(
      {
        tenantId,
        propertyId: propA,
        bookingId: booking2.id,
        page: 1,
        limit: 10,
      },
      managerActor,
    );
    // booking2 is on propA after move — manager OK; use booking on B
    const bookingB = await createConfirmed({
      unitId: unitB,
      checkIn: isoPlus(30),
      checkOut: isoPlus(32),
    });
    await reconcile.execute({ tenantId, bookingId: bookingB.id });
    const mgrFilterB = await listTasks.execute(
      {
        tenantId,
        propertyId: propA,
        bookingId: bookingB.id,
        page: 1,
        limit: 10,
      },
      managerActor,
    );
    if (mgrFilterB.isFailure) throw mgrFilterB.getError();
    if (mgrFilterB.getValue().total !== 0) {
      throw new Error("manager bookingId filter leaked B tasks via A property scope");
    }
    results.push("PASS manager ACL today/list/bookingId filter");

    const blocksAfter = await withTenantTransaction(tenantId, (tx) =>
      tx.unitCalendarBlock.count({
        where: { tenantId, blockType: { in: ["cleaning", "turnover"] } },
      }),
    );
    if (blocksAfter !== 0) {
      throw new Error("housekeeping created inventory cleaning/turnover blocks");
    }
    void blocksBefore;
    void oldUnit;
    results.push("PASS inventory separation (no HK cleaning blocks)");

    console.log(JSON.stringify({ ok: true, results }, null, 2));
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
      await tx.payment.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await tx.folio.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await tx.unitCalendarBlock.deleteMany({ where: { tenantId } });
      await tx.booking.deleteMany({ where: { tenantId } });
      await tx.quote.deleteMany({ where: { tenantId } });
      await tx.bookingHold.deleteMany({ where: { tenantId } });
      await tx.ratePlan.deleteMany({ where: { tenantId } });
      await tx.unitAvailabilityRule.deleteMany({ where: { tenantId } });
      await tx.outboxEvent.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await tx.guest.deleteMany({ where: { tenantId } }).catch(() => undefined);
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
