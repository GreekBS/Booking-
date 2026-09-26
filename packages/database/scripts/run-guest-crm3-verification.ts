/**
 * CRM-3 authorized demo-DB verification (isolated crm3-verify-* tenants).
 * Directory aggregation, notes visibility, tags, snapshot preservation.
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
    Guest,
    GuestNote,
    GuestTag,
    PermissionChecker,
    ListGuestsUseCase,
    AddGuestNoteUseCase,
    ListGuestNotesUseCase,
    CreateGuestTagUseCase,
    AssignGuestTagUseCase,
  } = await import("@hcp/domain");
  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    PrismaGuestRepository,
    PrismaGuestNoteRepository,
    PrismaGuestTagRepository,
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
      assertNotTalosProductionDatabase(dbUrl, "crm3-verify");
    }
  }

  const tenantId = randomUUID();
  const propertyA = randomUUID();
  const propertyB = randomUUID();
  const unitA = randomUUID();
  const unitB = randomUUID();
  const adminUserId = randomUUID();
  const managerUserId = randomUUID();
  const slug = `crm3-v-${tenantId.slice(0, 8)}`;
  const results: Record<string, unknown> = { tenantId, slug };

  const guests = new PrismaGuestRepository();
  const notes = new PrismaGuestNoteRepository();
  const tags = new PrismaGuestTagRepository();
  const ids = new UuidIdGenerator();
  const checker = new PermissionChecker();
  const listGuests = new ListGuestsUseCase(guests, checker);
  const addNote = new AddGuestNoteUseCase(guests, notes, ids, checker);
  const listNotes = new ListGuestNotesUseCase(guests, notes, checker);
  const createTag = new CreateGuestTagUseCase(tags, ids, checker);
  const assignTag = new AssignGuestTagUseCase(guests, tags, ids, checker);

  const admin: ActorContext = {
    userId: adminUserId,
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };
  const manager: ActorContext = {
    userId: managerUserId,
    role: "manager",
    propertyIds: [propertyA],
    isSuperAdmin: false,
  };

  await clearTenantContext(prisma);
  await prisma.tenant.create({ data: { id: tenantId, name: "CRM3 Verify", slug } });
  await prisma.user.create({
    data: {
      id: adminUserId,
      email: `crm3-admin-${tenantId.slice(0, 8)}@demo.test`,
      name: "CRM3 Admin",
    },
  });
  await prisma.user.create({
    data: {
      id: managerUserId,
      email: `crm3-mgr-${tenantId.slice(0, 8)}@demo.test`,
      name: "CRM3 Manager",
    },
  });

  await withTenantTransaction(tenantId, async (tx) => {
    for (const [pid, uid, name] of [
      [propertyA, unitA, "A"],
      [propertyB, unitB, "B"],
    ] as const) {
      await tx.property.create({
        data: {
          id: pid,
          tenantId,
          name: `CRM3 Prop ${name}`,
          slug: `crm3-p-${pid.slice(0, 8)}`,
          timezone: "Europe/Athens",
          status: "active",
        },
      });
      await tx.unit.create({
        data: {
          id: uid,
          tenantId,
          propertyId: pid,
          name: `Unit ${name}`,
          slug: `crm3-u-${uid.slice(0, 8)}`,
          maxGuests: 4,
          status: "active",
        },
      });
    }
  });

  try {
    const guest = Guest.create({
      id: randomUUID(),
      tenantId,
      displayName: "CRM3 Shared Guest",
      email: `crm3-shared-${tenantId.slice(0, 8)}@demo.test`,
      phone: "+306900000311",
    });
    await guests.save(guest);

    // Link bookings at A and B (minimal rows for directory metrics)
    const holdA = randomUUID();
    const quoteA = randomUUID();
    const bookingA = randomUUID();
    const holdB = randomUUID();
    const quoteB = randomUUID();
    const bookingB = randomUUID();

    await withTenantTransaction(tenantId, async (tx) => {
      for (const row of [
        {
          holdId: holdA,
          quoteId: quoteA,
          bookingId: bookingA,
          unitId: unitA,
          propertyId: propertyA,
          checkIn: "2027-03-01",
          checkOut: "2027-03-04",
        },
        {
          holdId: holdB,
          quoteId: quoteB,
          bookingId: bookingB,
          unitId: unitB,
          propertyId: propertyB,
          checkIn: "2027-04-01",
          checkOut: "2027-04-05",
        },
      ]) {
        const snapshotId = randomUUID();
        await tx.bookingHold.create({
          data: {
            id: row.holdId,
            tenantId,
            unitId: row.unitId,
            propertyId: row.propertyId,
            checkIn: new Date(row.checkIn),
            checkOut: new Date(row.checkOut),
            guestCount: 2,
            status: "converted",
            expiresAt: new Date("2099-01-01"),
          },
        });
        await tx.quote.create({
          data: {
            id: row.quoteId,
            tenantId,
            holdId: row.holdId,
            unitId: row.unitId,
            propertyId: row.propertyId,
            snapshotId,
            snapshot: { currency: "EUR", totalAmount: "100.0000" },
            currency: "EUR",
            totalAmount: "100.0000",
            expiresAt: new Date("2099-01-01"),
          },
        });
        await tx.booking.create({
          data: {
            id: row.bookingId,
            tenantId,
            unitId: row.unitId,
            propertyId: row.propertyId,
            holdId: row.holdId,
            quoteId: row.quoteId,
            quoteSnapshotId: snapshotId,
            checkIn: new Date(row.checkIn),
            checkOut: new Date(row.checkOut),
            guestCount: 2,
            guestName: guest.displayName,
            guestEmail: guest.email!,
            guestPhone: guest.phone,
            guestId: guest.id,
            status: "confirmed",
            confirmationMode: "manual",
            totalAmount: "100.0000",
            currency: "EUR",
          },
        });
      }
    });

    const dirA = await listGuests.execute(
      { tenantId, propertyId: propertyA, page: 1, limit: 20 },
      admin,
    );
    results.directoryActiveProperty =
      dirA.isSuccess &&
      dirA.getValue().data.some((r) => r.guest.id === guest.id) &&
      dirA.getValue().data.find((r) => r.guest.id === guest.id)!.metrics.stayCount === 1;

    const mgrDirB = await listGuests.execute(
      { tenantId, propertyId: propertyB, page: 1, limit: 20 },
      manager,
    );
    results.managerUnauthorizedPropertyForbidden = mgrDirB.isFailure;

    const mgrDirA = await listGuests.execute(
      { tenantId, propertyId: propertyA, page: 1, limit: 20 },
      manager,
    );
    results.managerAuthorizedDirectory =
      mgrDirA.isSuccess &&
      mgrDirA.getValue().data.length === 1 &&
      mgrDirA.getValue().data[0]!.metrics.stayCount === 1;

    const tenantWideNote = await addNote.execute(
      {
        tenantId,
        guestId: guest.id,
        body: "Admin tenant-wide note",
        propertyId: null,
      },
      admin,
    );
    results.adminTenantWideNote = tenantWideNote.isSuccess;

    const mgrNote = await addNote.execute(
      {
        tenantId,
        guestId: guest.id,
        body: "Manager property A note",
        propertyId: propertyA,
      },
      manager,
    );
    results.managerPropertyNote = mgrNote.isSuccess;

    const mgrNotes = await listNotes.execute(
      { tenantId, guestId: guest.id },
      manager,
    );
    results.managerCannotSeeTenantWideNote =
      mgrNotes.isSuccess &&
      mgrNotes.getValue().every((n) => n.propertyId != null) &&
      !mgrNotes.getValue().some((n) => n.isTenantWide);

    const adminNotes = await listNotes.execute(
      { tenantId, guestId: guest.id },
      admin,
    );
    results.adminSeesAllNotes =
      adminNotes.isSuccess && adminNotes.getValue().length >= 2;

    const tag = await createTag.execute({ tenantId, name: "VIP" }, admin);
    results.tagCreate = tag.isSuccess;
    const assigned = await assignTag.execute(
      { tenantId, guestId: guest.id, tagId: tag.getValue().id },
      admin,
    );
    results.tagAssign = assigned.isSuccess;
    const assignedAgain = await assignTag.execute(
      { tenantId, guestId: guest.id, tagId: tag.getValue().id },
      admin,
    );
    results.tagAssignIdempotent =
      assignedAgain.isSuccess && assignedAgain.getValue().alreadyAssigned === true;

    const snapshotEmail = guest.email;
    guest.updateProfile({ displayName: "Renamed CRM3", email: `renamed-${tenantId.slice(0, 8)}@demo.test` });
    await guests.save(guest);
    const bookingSnap = await withTenantTransaction(tenantId, async (tx) =>
      tx.booking.findFirst({
        where: { id: bookingA },
        select: { guestName: true, guestEmail: true },
      }),
    );
    results.snapshotPreserved =
      bookingSnap?.guestName === "CRM3 Shared Guest" &&
      bookingSnap?.guestEmail === snapshotEmail;

    const otherTenant = randomUUID();
    await prisma.tenant.create({
      data: { id: otherTenant, name: "CRM3 Other", slug: `crm3-o-${otherTenant.slice(0, 8)}` },
    });
    const cross = await guests.findById(otherTenant, guest.id);
    results.crossTenantGuestHidden = cross == null;
    await prisma.tenant.delete({ where: { id: otherTenant } });

    const checks = [
      "directoryActiveProperty",
      "managerUnauthorizedPropertyForbidden",
      "managerAuthorizedDirectory",
      "adminTenantWideNote",
      "managerPropertyNote",
      "managerCannotSeeTenantWideNote",
      "adminSeesAllNotes",
      "tagCreate",
      "tagAssign",
      "tagAssignIdempotent",
      "snapshotPreserved",
      "crossTenantGuestHidden",
    ];
    results.PASS = checks.every((k) => results[k] === true);
    console.log(JSON.stringify(results, null, 2));
    if (!results.PASS) process.exitCode = 1;
  } catch (err) {
    console.error("CRM3 verify failed:", err instanceof Error ? err.message : err);
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    await clearTenantContext(prisma);
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.booking.deleteMany({ where: { tenantId } });
      await tx.quote.deleteMany({ where: { tenantId } });
      await tx.bookingHold.deleteMany({ where: { tenantId } });
      await tx.guestTagAssignment.deleteMany({ where: { tenantId } });
      await tx.guestNote.deleteMany({ where: { tenantId } });
      await tx.guestTag.deleteMany({ where: { tenantId } });
      await tx.guest.deleteMany({ where: { tenantId } });
      await tx.unit.deleteMany({ where: { tenantId } });
      await tx.property.deleteMany({ where: { tenantId } });
    }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, managerUserId] } } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
