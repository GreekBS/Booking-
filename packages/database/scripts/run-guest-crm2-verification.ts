/**
 * CRM-2 authorized demo-DB verification (isolated crm2-verify-* tenants).
 * Proves: booking Guest link, match, ambiguity, snapshot, TX rollback, concurrency.
 *
 * Load dotenv BEFORE @hcp/database so Prisma binds RUNTIME_DATABASE_URL.
 * When targeting the Talos prod project ref, set ALLOW_TALOS_PRODUCTION_DB_MUTATION=true.
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
    CreateHoldUseCase,
    CreateQuoteUseCase,
    CreateBookingUseCase,
    PermissionChecker,
    ReservationOrchestrator,
    ResolveOrCreateGuest,
    ConflictError,
  } = await import("@hcp/domain");
  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    PrismaGuestRepository,
    PrismaHoldRepository,
    PrismaQuoteRepository,
    PrismaBookingRepository,
    PrismaCalendarBlockRepository,
    PrismaRatePlanRepository,
    PrismaAvailabilityRulesRepository,
    PrismaCommerceFlowRepository,
    PrismaCatalogQueryAdapter,
    PrismaOutboxRepository,
    PrismaAuditLogRepository,
    TimezoneService,
    UuidIdGenerator,
    assertNotTalosProductionDatabase,
    isTalosProductionDatabaseUrl,
  } = await import("../src/index.js");

  type ActorContext = import("@hcp/domain").ActorContext;

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "crm2-verify");
    }
  }

  const tenantId = randomUUID();
  const propertyId = randomUUID();
  const unitId = randomUUID();
  const adminUserId = randomUUID();
  const slug = `crm2-v-${tenantId.slice(0, 8)}`;

  const results: Record<string, unknown> = { tenantId, slug };

  const outbox = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outbox);
  const quoteRepository = new PrismaQuoteRepository(outbox);
  const bookingRepository = new PrismaBookingRepository(outbox);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const commerceFlowRepository = new PrismaCommerceFlowRepository(outbox);
  const catalog = new PrismaCatalogQueryAdapter();
  const timezone = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const audit = new PrismaAuditLogRepository();
  const ids = new UuidIdGenerator();
  const guests = new PrismaGuestRepository();
  const resolver = new ResolveOrCreateGuest(guests, ids, permissionChecker);

  const adminActor: ActorContext = {
    userId: adminUserId,
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };

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
    permissionChecker,
    ids,
  );
  const createQuote = new CreateQuoteUseCase(
    catalog,
    holdRepository,
    quoteRepository,
    orchestrator,
    permissionChecker,
    ids,
  );
  const createBooking = new CreateBookingUseCase(
    holdRepository,
    quoteRepository,
    commerceFlowRepository,
    permissionChecker,
    audit,
    ids,
    resolver,
    guests,
  );

  async function book(
    checkIn: string,
    checkOut: string,
    guest: { name: string; email: string; phone: string | null },
  ) {
    return withTenantTransaction(tenantId, async () => {
      const hold = await createHold.execute(
        { tenantId, unitId, checkIn, checkOut, guestCount: 2 },
        adminActor,
      );
      if (hold.isFailure) throw hold.getError();
      const quote = await createQuote.execute(
        { tenantId, holdId: hold.getValue().id },
        adminActor,
      );
      if (quote.isFailure) throw quote.getError();
      return createBooking.execute(
        {
          tenantId,
          quoteId: quote.getValue().id,
          guest,
          confirmationMode: "manual",
        },
        adminActor,
      );
    });
  }

  await clearTenantContext(prisma);
  await prisma.tenant.create({
    data: { id: tenantId, name: "CRM2 Verify", slug },
  });
  await prisma.user.create({
    data: {
      id: adminUserId,
      email: `crm2-admin-${tenantId.slice(0, 8)}@demo.test`,
      name: "CRM2 Admin",
    },
  });
  await withTenantTransaction(tenantId, async (tx) => {
    await tx.property.create({
      data: {
        id: propertyId,
        tenantId,
        name: "CRM2 Property",
        slug: `crm2-p-${propertyId.slice(0, 8)}`,
        timezone: "Europe/Athens",
        status: "active",
      },
    });
    await tx.unit.create({
      data: {
        id: unitId,
        tenantId,
        propertyId,
        name: "CRM2 Unit",
        slug: `crm2-u-${unitId.slice(0, 8)}`,
        maxGuests: 4,
        status: "active",
      },
    });
    await tx.ratePlan.create({
      data: {
        id: randomUUID(),
        tenantId,
        unitId,
        baseNightlyAmount: "100.0000",
        currency: "EUR",
      },
    });
    await tx.unitAvailabilityRule.create({
      data: { id: randomUUID(), tenantId, unitId },
    });
  });

  try {
    const email = `crm2-new-${tenantId.slice(0, 8)}@demo.test`;
    const created = await book("2027-01-01", "2027-01-04", {
      name: "CRM2 New",
      email,
      phone: null,
    });
    results.manualCreateOk = created.isSuccess;
    results.manualGuestIdSet = !!created.getValue().guestId;

    const matchEmail = `crm2-match-${tenantId.slice(0, 8)}@demo.test`;
    const g = { name: "CRM2 Match", email: matchEmail, phone: "+306900000099" };
    const first = await book("2027-02-01", "2027-02-04", g);
    const second = await book("2027-03-01", "2027-03-04", g);
    results.repeatMatchSameGuest =
      first.isSuccess &&
      second.isSuccess &&
      first.getValue().guestId === second.getValue().guestId;

    const ambEmail = `crm2-amb-${tenantId.slice(0, 8)}@demo.test`;
    const a1 = await book("2027-04-01", "2027-04-04", {
      name: "Alice Smith",
      email: ambEmail,
      phone: null,
    });
    const a2 = await book("2027-05-01", "2027-05-04", {
      name: "Robert Jones",
      email: ambEmail,
      phone: null,
    });
    results.ambiguousSeparateGuests =
      a1.isSuccess &&
      a2.isSuccess &&
      a1.getValue().guestId !== a2.getValue().guestId;

    const snapEmail = `crm2-snap-${tenantId.slice(0, 8)}@demo.test`;
    const snap = await book("2027-06-01", "2027-06-04", {
      name: "Snap Guest",
      email: snapEmail,
      phone: "+306911111199",
    });
    const booking = snap.getValue();
    const guest = await guests.findById(tenantId, booking.guestId!);
    guest!.updateProfile({
      displayName: "Changed",
      email: `changed-${tenantId.slice(0, 8)}@demo.test`,
    });
    await guests.save(guest!);
    const reloaded = await bookingRepository.findById(booking.id, tenantId);
    results.snapshotPreserved =
      reloaded?.guest.name === "Snap Guest" &&
      reloaded?.guest.email === snapEmail;

    const beforeRollback = await prisma.guest.count({ where: { tenantId } });
    let rollbackThrew = false;
    try {
      await withTenantTransaction(tenantId, async () => {
        const r = await resolver.executeForBookingCreate(
          {
            tenantId,
            contact: {
              displayName: "Rollback",
              email: `crm2-rb-${tenantId.slice(0, 8)}@demo.test`,
              phone: null,
            },
          },
          adminActor,
        );
        if (r.isFailure) throw r.getError();
        throw new ConflictError("forced inventory conflict");
      });
    } catch (e) {
      rollbackThrew = e instanceof ConflictError;
    }
    const afterRollback = await prisma.guest.count({ where: { tenantId } });
    results.rollbackNoOrphan =
      rollbackThrew && afterRollback === beforeRollback;

    const concEmail = `crm2-conc-${tenantId.slice(0, 8)}@demo.test`;
    const cg = {
      name: "Concurrent",
      email: concEmail,
      phone: "+306933333399",
    };
    const [c1, c2] = await Promise.all([
      book("2027-07-01", "2027-07-04", cg),
      book("2027-08-01", "2027-08-04", cg),
    ]);
    results.concurrencySameGuest =
      c1.isSuccess &&
      c2.isSuccess &&
      c1.getValue().guestId === c2.getValue().guestId;

    const storefrontActor: ActorContext = {
      userId: `storefront:${tenantId}`,
      role: "admin",
      propertyIds: null,
      isSuperAdmin: false,
    };
    const hijack = await withTenantTransaction(tenantId, async () => {
      const hold = await createHold.execute(
        {
          tenantId,
          unitId,
          checkIn: "2027-09-01",
          checkOut: "2027-09-04",
          guestCount: 2,
        },
        storefrontActor,
      );
      if (hold.isFailure) throw hold.getError();
      const quote = await createQuote.execute(
        { tenantId, holdId: hold.getValue().id },
        storefrontActor,
      );
      if (quote.isFailure) throw quote.getError();
      return createBooking.execute(
        {
          tenantId,
          quoteId: quote.getValue().id,
          guest: {
            name: "Hijack",
            email: `crm2-hijack-${tenantId.slice(0, 8)}@demo.test`,
            phone: null,
          },
          guestId: booking.guestId,
        },
        storefrontActor,
      );
    });
    results.storefrontGuestIdRejected = hijack.isFailure;

    const allPass = Object.entries(results)
      .filter(([k]) =>
        [
          "manualCreateOk",
          "manualGuestIdSet",
          "repeatMatchSameGuest",
          "ambiguousSeparateGuests",
          "snapshotPreserved",
          "rollbackNoOrphan",
          "concurrencySameGuest",
          "storefrontGuestIdRejected",
        ].includes(k),
      )
      .every(([, v]) => v === true);

    results.PASS = allPass;
    console.log(JSON.stringify(results, null, 2));
    if (!allPass) process.exitCode = 1;
  } catch (err) {
    console.error("CRM2 verify failed:", err instanceof Error ? err.message : err);
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    await clearTenantContext(prisma);
    const cleanup = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.warn(`cleanup ${label}:`, e instanceof Error ? e.message : e);
      }
    };
    await cleanup("tenant-scoped", () =>
      withTenantTransaction(tenantId, async (tx) => {
        await tx.unitCalendarBlock.deleteMany({ where: { tenantId } });
        await tx.booking.deleteMany({ where: { tenantId } });
        await tx.quote.deleteMany({ where: { tenantId } });
        await tx.bookingHold.deleteMany({ where: { tenantId } });
        await tx.guest.deleteMany({ where: { tenantId } });
        await tx.ratePlan.deleteMany({ where: { tenantId } });
        await tx.unitAvailabilityRule.deleteMany({ where: { tenantId } });
        await tx.unit.deleteMany({ where: { tenantId } });
        await tx.property.deleteMany({ where: { tenantId } });
        await tx.auditLog.deleteMany({ where: { tenantId } });
      }),
    );
    await cleanup("tenant", () => prisma.tenant.deleteMany({ where: { id: tenantId } }));
    await cleanup("user", () => prisma.user.deleteMany({ where: { id: adminUserId } }));
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
