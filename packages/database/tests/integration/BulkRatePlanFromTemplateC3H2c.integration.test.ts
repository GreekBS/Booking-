/**
 * Phase C3-H2c — bulk RatePlan-from-template apply + booking financial protection.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  ApplyBulkRatePlanFromTemplateUseCase,
  BULK_RATE_PLAN_CONFIRM_TTL_SECONDS,
  BULK_RATE_PLAN_CONFIRM_TYP,
  PermissionChecker,
  PreviewBulkRatePlanFromTemplateUseCase,
  PricingCalculator,
  RoomType,
  StayPeriod,
  type BulkRatePlanConfirmClaims,
  type IBulkRatePlanConfirmTokenService,
  type RatePlanProps,
} from "@hcp/domain";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaPropertyRepository } from "../../src/repositories/PropertyRepository";
import { PrismaRoomTypeRepository } from "../../src/repositories/RoomTypeRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAuditLogRepository } from "../../src/repositories/AuditLogRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import {
  clearTenantContext,
  prisma,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT = randomUUID();
const PROP = randomUUID();
const RT = randomUUID();
const SOURCE = randomUUID();
const TARGET_MISSING = randomUUID();
const TARGET_CUSTOM = randomUUID();
const TARGET_BOOKED = randomUUID();
const ACTOR = randomUUID();
const SLUG = `int-h2c-${TENANT.slice(0, 8)}`;

const TEMPLATE: RatePlanProps = {
  baseNightlyAmount: "120.0000",
  currency: "EUR",
  seasons: [
    {
      id: randomUUID(),
      name: "Peak",
      startDate: "2026-07-01",
      endDate: "2026-08-31",
      nightlyAmount: "180.0000",
    },
  ],
  dowModifiers: [
    { dayOfWeek: 5, modifierType: "percent", modifierValue: "10.0000" },
  ],
  losDiscounts: [],
};

const CUSTOM: RatePlanProps = {
  baseNightlyAmount: "250.0000",
  currency: "EUR",
  seasons: [],
  dowModifiers: [],
  losDiscounts: [],
};

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

class TestConfirmTokens implements IBulkRatePlanConfirmTokenService {
  constructor(private readonly secret = "test-bulk-rate-it-secret") {}

  issue(
    input: Omit<BulkRatePlanConfirmClaims, "typ" | "v" | "iat" | "exp"> & {
      now?: Date;
      ttlSeconds?: number;
    },
  ) {
    const now = input.now ?? new Date();
    const iat = Math.floor(now.getTime() / 1000);
    const claims: BulkRatePlanConfirmClaims = {
      typ: BULK_RATE_PLAN_CONFIRM_TYP,
      v: 1,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      sourceUnitId: input.sourceUnitId,
      roomTypeId: input.roomTypeId,
      targetUnitIds: [...input.targetUnitIds].sort(),
      mode: input.mode,
      sourceFingerprint: input.sourceFingerprint,
      targetFingerprints: { ...input.targetFingerprints },
      applyUnitIds: [...input.applyUnitIds].sort(),
      skipUnitIds: [...input.skipUnitIds].sort(),
      actorId: input.actorId,
      iat,
      exp: iat + (input.ttlSeconds ?? BULK_RATE_PLAN_CONFIRM_TTL_SECONDS),
    };
    const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
    const sig = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    return { token: `${payload}.${sig}`, claims };
  }

  verify(token: string, now: Date = new Date()) {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const claims = JSON.parse(
      fromB64url(payload).toString("utf8"),
    ) as BulkRatePlanConfirmClaims;
    if (Math.floor(now.getTime() / 1000) > claims.exp) return null;
    return claims;
  }
}

const outbox = new PrismaOutboxRepository();
const propertyRepository = new PrismaPropertyRepository(outbox);
const roomTypeRepository = new PrismaRoomTypeRepository();
const ratePlanRepository = new PrismaRatePlanRepository();
const auditLogRepository = new PrismaAuditLogRepository();
const idGenerator = new UuidIdGenerator();
const permissionChecker = new PermissionChecker();
const tokens = new TestConfirmTokens();

const admin = {
  userId: ACTOR,
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function useCases() {
  const preview = new PreviewBulkRatePlanFromTemplateUseCase(
    propertyRepository,
    ratePlanRepository,
    permissionChecker,
    tokens,
  );
  const apply = new ApplyBulkRatePlanFromTemplateUseCase(
    propertyRepository,
    ratePlanRepository,
    permissionChecker,
    idGenerator,
    outbox,
    auditLogRepository,
    tokens,
    preview,
  );
  return { preview, apply };
}

async function seedBookingOnUnit(unitId: string, opts: {
  bookingId: string;
  holdId: string;
  quoteId: string;
  snapshotId: string;
  totalAmount: string;
  checkIn: string;
  checkOut: string;
  pricingMode?: "talos_calculated" | "imported_csv" | "operator_entered";
  status?: "confirmed" | "pending";
}) {
  const snapshot = {
    version: 1,
    checkIn: opts.checkIn,
    checkOut: opts.checkOut,
    propertyTimezone: "Europe/Athens",
    currency: "EUR",
    lineItems: [
      {
        date: opts.checkIn,
        baseAmount: "100.0000",
        seasonAmount: null,
        dowModifierAmount: "0.0000",
        nightlyAmount: "100.0000",
      },
    ],
    subtotalAmount: opts.totalAmount,
    feesAmount: "0.0000",
    taxesAmount: "0.0000",
    totalAmount: opts.totalAmount,
    quotedAt: new Date().toISOString(),
    pricingMode: opts.pricingMode ?? "talos_calculated",
  };

  await withTenantTransaction(TENANT, async (tx) => {
    await tx.bookingHold.create({
      data: {
        id: opts.holdId,
        tenantId: TENANT,
        unitId,
        propertyId: PROP,
        checkIn: new Date(opts.checkIn),
        checkOut: new Date(opts.checkOut),
        guestCount: 2,
        status: "converted",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await tx.quote.create({
      data: {
        id: opts.quoteId,
        tenantId: TENANT,
        holdId: opts.holdId,
        unitId,
        propertyId: PROP,
        snapshotId: opts.snapshotId,
        snapshot,
        currency: "EUR",
        totalAmount: opts.totalAmount,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await tx.booking.create({
      data: {
        id: opts.bookingId,
        tenantId: TENANT,
        unitId,
        propertyId: PROP,
        quoteId: opts.quoteId,
        holdId: opts.holdId,
        quoteSnapshotId: opts.snapshotId,
        guestName: "H2c Guest",
        guestEmail: "h2c@example.com",
        guestCount: 2,
        checkIn: new Date(opts.checkIn),
        checkOut: new Date(opts.checkOut),
        status: opts.status ?? "confirmed",
        confirmationMode: "manual",
        totalAmount: opts.totalAmount,
        currency: "EUR",
        confirmedAt: new Date(),
      },
    });
  });
}

runIntegration("BulkRatePlanFromTemplate C3-H2c", () => {
  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.user.create({
      data: {
        id: ACTOR,
        email: `h2c-${ACTOR.slice(0, 8)}@int.test`,
        name: "H2c Admin",
      },
    });
    await prisma.tenant.create({
      data: { id: TENANT, name: "H2c Tenant", slug: SLUG },
    });
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP,
          tenantId: TENANT,
          name: "H2c Hotel",
          slug: `h2c-hotel-${PROP.slice(0, 6)}`,
          type: "hotel",
          status: "active",
        },
      });
      await tx.unit.create({
        data: {
          id: randomUUID(),
          tenantId: TENANT,
          propertyId: PROP,
          name: "Entire Property",
          slug: "entire-property",
          maxGuests: 2,
          status: "inactive",
        },
      });
      for (const [id, name, room] of [
        [SOURCE, "Std 100", "100"],
        [TARGET_MISSING, "Std 101", "101"],
        [TARGET_CUSTOM, "Std 102", "102"],
        [TARGET_BOOKED, "Std 103", "103"],
      ] as const) {
        await tx.unit.create({
          data: {
            id,
            tenantId: TENANT,
            propertyId: PROP,
            name,
            slug: `room-${room}`,
            maxGuests: 2,
            roomNumber: room,
            status: "active",
          },
        });
      }
      await tx.membership.create({
        data: {
          id: randomUUID(),
          userId: ACTOR,
          tenantId: TENANT,
          role: "admin",
          status: "active",
        },
      });
    });

    await roomTypeRepository.save(
      RoomType.create({
        id: RT,
        tenantId: TENANT,
        propertyId: PROP,
        name: "Standard Double",
        code: "STD",
        maxGuests: 2,
      }),
    );

    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unit.updateMany({
        where: {
          id: { in: [SOURCE, TARGET_MISSING, TARGET_CUSTOM, TARGET_BOOKED] },
        },
        data: { roomTypeId: RT },
      });
    });

    await ratePlanRepository.save(TENANT, SOURCE, TEMPLATE);
    await ratePlanRepository.save(TENANT, TARGET_CUSTOM, CUSTOM);
    await ratePlanRepository.save(TENANT, TARGET_BOOKED, {
      baseNightlyAmount: "100.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    // Confirmed future booking + imported OTA-style booking on TARGET_BOOKED
    await seedBookingOnUnit(TARGET_BOOKED, {
      bookingId: randomUUID(),
      holdId: randomUUID(),
      quoteId: randomUUID(),
      snapshotId: randomUUID(),
      totalAmount: "300.0000",
      checkIn: "2026-11-10",
      checkOut: "2026-11-13",
      status: "confirmed",
      pricingMode: "talos_calculated",
    });
    await seedBookingOnUnit(TARGET_BOOKED, {
      bookingId: randomUUID(),
      holdId: randomUUID(),
      quoteId: randomUUID(),
      snapshotId: randomUUID(),
      totalAmount: "444.5000",
      checkIn: "2026-12-01",
      checkOut: "2026-12-04",
      status: "confirmed",
      pricingMode: "imported_csv",
    });
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.booking.deleteMany({ where: { tenantId: TENANT } });
      await tx.quote.deleteMany({ where: { tenantId: TENANT } });
      await tx.bookingHold.deleteMany({ where: { tenantId: TENANT } });
      await tx.auditLog.deleteMany({ where: { tenantId: TENANT } });
      await tx.rateDowModifier.deleteMany({ where: { tenantId: TENANT } });
      await tx.rateSeason.deleteMany({ where: { tenantId: TENANT } });
      await tx.ratePlan.deleteMany({ where: { tenantId: TENANT } });
      await tx.unit.deleteMany({ where: { tenantId: TENANT } });
      await tx.roomType.deleteMany({ where: { tenantId: TENANT } });
      await tx.outboxEvent.deleteMany({ where: { tenantId: TENANT } });
      await tx.membership.deleteMany({ where: { tenantId: TENANT } });
      await tx.property.deleteMany({ where: { tenantId: TENANT } });
    });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.user.deleteMany({ where: { id: ACTOR } });
    await prisma.$disconnect();
  });

  it("preview performs no writes", async () => {
    const { preview } = useCases();
    const beforePlans = await withTenantTransaction(TENANT, async (tx) =>
      tx.ratePlan.count({ where: { tenantId: TENANT } }),
    );
    const beforeOutbox = await withTenantTransaction(TENANT, async (tx) =>
      tx.outboxEvent.count({ where: { tenantId: TENANT } }),
    );

    const result = await preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_MISSING, TARGET_CUSTOM],
        mode: "skip_customized",
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().applyCount).toBe(1);
    expect(result.getValue().targets.find((t) => t.unitId === TARGET_CUSTOM)?.decision).toBe(
      "skip_protected",
    );

    const afterPlans = await withTenantTransaction(TENANT, async (tx) =>
      tx.ratePlan.count({ where: { tenantId: TENANT } }),
    );
    const afterOutbox = await withTenantTransaction(TENANT, async (tx) =>
      tx.outboxEvent.count({ where: { tenantId: TENANT } }),
    );
    expect(afterPlans).toBe(beforePlans);
    expect(afterOutbox).toBe(beforeOutbox);
  });

  it("skip_customized creates missing plans and protects customized; bookings unchanged", async () => {
    const { preview, apply } = useCases();

    const bookingsBefore = await withTenantTransaction(TENANT, async (tx) =>
      tx.booking.findMany({
        where: { tenantId: TENANT, unitId: TARGET_BOOKED },
        orderBy: { checkIn: "asc" },
        select: {
          id: true,
          totalAmount: true,
          currency: true,
          quoteId: true,
        },
      }),
    );
    const quotesBefore = await withTenantTransaction(TENANT, async (tx) =>
      tx.quote.findMany({
        where: { id: { in: bookingsBefore.map((b) => b.quoteId) } },
        select: { id: true, totalAmount: true, snapshot: true },
      }),
    );

    const previewed = await preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_MISSING, TARGET_CUSTOM, TARGET_BOOKED],
        mode: "skip_customized",
      },
      admin,
    );
    expect(previewed.isSuccess).toBe(true);

    const applied = await apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(applied.isSuccess).toBe(true);
    expect(applied.getValue().appliedUnitIds).toEqual([TARGET_MISSING]);
    expect(applied.getValue().skippedUnitIds).toEqual(
      expect.arrayContaining([TARGET_CUSTOM, TARGET_BOOKED]),
    );

    const created = await ratePlanRepository.findByUnitId(TARGET_MISSING, TENANT);
    expect(created).not.toBeNull();
    expect(Number(created!.baseNightlyAmount)).toBe(120);
    expect(created!.seasons[0]!.id).not.toBe(TEMPLATE.seasons[0]!.id);

    const customStill = await ratePlanRepository.findByUnitId(TARGET_CUSTOM, TENANT);
    expect(Number(customStill!.baseNightlyAmount)).toBe(250);

    const bookingsAfter = await withTenantTransaction(TENANT, async (tx) =>
      tx.booking.findMany({
        where: { tenantId: TENANT, unitId: TARGET_BOOKED },
        orderBy: { checkIn: "asc" },
        select: {
          id: true,
          totalAmount: true,
          currency: true,
          quoteId: true,
        },
      }),
    );
    expect(bookingsAfter.map((b) => String(b.totalAmount))).toEqual(
      bookingsBefore.map((b) => String(b.totalAmount)),
    );

    const quotesAfter = await withTenantTransaction(TENANT, async (tx) =>
      tx.quote.findMany({
        where: { id: { in: quotesBefore.map((q) => q.id) } },
        select: { id: true, totalAmount: true, snapshot: true },
      }),
    );
    for (const q of quotesBefore) {
      const after = quotesAfter.find((x) => x.id === q.id)!;
      expect(String(after.totalAmount)).toBe(String(q.totalAmount));
      expect(after.snapshot).toEqual(q.snapshot);
    }

    const audits = await withTenantTransaction(TENANT, async (tx) =>
      tx.auditLog.findMany({
        where: {
          tenantId: TENANT,
          action: "rate_plan.bulk_apply_from_template",
        },
      }),
    );
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const meta = audits[audits.length - 1]!.metadata as Record<string, unknown>;
    expect(meta.sourceUnitId).toBe(SOURCE);
    expect(meta.mode).toBe("skip_customized");
  });

  it("overwrite_all updates booked unit RatePlan without mutating booking financials", async () => {
    const { preview, apply } = useCases();

    const bookingRows = await withTenantTransaction(TENANT, async (tx) =>
      tx.booking.findMany({
        where: { tenantId: TENANT, unitId: TARGET_BOOKED },
        select: { id: true, totalAmount: true, quoteId: true },
      }),
    );
    const quoteRows = await withTenantTransaction(TENANT, async (tx) =>
      tx.quote.findMany({
        where: { id: { in: bookingRows.map((b) => b.quoteId) } },
      }),
    );
    const snapshotJson = quoteRows.map((q) => JSON.stringify(q.snapshot));

    const previewed = await preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_BOOKED],
        mode: "overwrite_all",
      },
      admin,
    );
    expect(previewed.isSuccess).toBe(true);
    expect(previewed.getValue().overwriteCount).toBe(1);

    const denied = await apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(denied.isFailure).toBe(true);

    const applied = await apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
        confirmOverwrite: true,
      },
      admin,
    );
    expect(applied.isSuccess).toBe(true);

    const updatedPlan = await ratePlanRepository.findByUnitId(TARGET_BOOKED, TENANT);
    expect(Number(updatedPlan!.baseNightlyAmount)).toBe(120);

    const bookingsAfter = await withTenantTransaction(TENANT, async (tx) =>
      tx.booking.findMany({
        where: { tenantId: TENANT, unitId: TARGET_BOOKED },
        select: { id: true, totalAmount: true, quoteId: true },
      }),
    );
    expect(bookingsAfter.map((b) => String(b.totalAmount)).sort()).toEqual(
      bookingRows.map((b) => String(b.totalAmount)).sort(),
    );

    const quotesAfter = await withTenantTransaction(TENANT, async (tx) =>
      tx.quote.findMany({
        where: { id: { in: quoteRows.map((q) => q.id) } },
      }),
    );
    expect(quotesAfter.map((q) => JSON.stringify(q.snapshot)).sort()).toEqual(
      [...snapshotJson].sort(),
    );

    // New pricing from RatePlan differs from frozen snapshot totals.
    const live = new PricingCalculator().calculate(
      updatedPlan!,
      StayPeriod.create("2026-11-10", "2026-11-13"),
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(live.total.amount).not.toBe("300.0000");

    const rateEvents = await withTenantTransaction(TENANT, async (tx) =>
      tx.outboxEvent.count({
        where: {
          tenantId: TENANT,
          eventType: "UnitExternalSyncRequired",
          aggregateId: TARGET_BOOKED,
        },
      }),
    );
    expect(rateEvents).toBeGreaterThanOrEqual(1);
  });

  it("stale confirmation rejected when target pricing changes", async () => {
    const { preview, apply } = useCases();
    // Reset TARGET_CUSTOM to a distinct plan for this test
    await ratePlanRepository.save(TENANT, TARGET_CUSTOM, CUSTOM);

    const previewed = await preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_CUSTOM],
        mode: "overwrite_all",
      },
      admin,
    );

    await ratePlanRepository.save(TENANT, TARGET_CUSTOM, {
      ...CUSTOM,
      baseNightlyAmount: "260.0000",
    });

    const applied = await apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
        confirmOverwrite: true,
      },
      admin,
    );
    expect(applied.isFailure).toBe(true);
    expect(applied.getError().message).toMatch(/stale/i);
  });

  it("rolls back all rate writes when mid-batch save fails", async () => {
    const missing2 = randomUUID();
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unit.create({
        data: {
          id: missing2,
          tenantId: TENANT,
          propertyId: PROP,
          name: "Std 104",
          slug: "room-104",
          maxGuests: 2,
          roomNumber: "104",
          roomTypeId: RT,
          status: "active",
        },
      });
    });

    // Ensure TARGET_MISSING already has a plan from prior test; create a fresh missing unit
    const freshMissing = missing2;
    const beforePlan = await ratePlanRepository.findByUnitId(freshMissing, TENANT);
    expect(beforePlan).toBeNull();

    let saves = 0;
    const flakyRates: typeof ratePlanRepository = {
      findByUnitId: (unitId, tenantId) =>
        ratePlanRepository.findByUnitId(unitId, tenantId),
      findByUnitIds: (unitIds, tenantId) =>
        ratePlanRepository.findByUnitIds(unitIds, tenantId),
      save: async (tenantId, unitId, plan) => {
        saves += 1;
        if (saves >= 2) throw new Error("simulated rate plan failure");
        await ratePlanRepository.save(tenantId, unitId, plan);
      },
    };

    const preview = new PreviewBulkRatePlanFromTemplateUseCase(
      propertyRepository,
      flakyRates,
      permissionChecker,
      tokens,
    );
    const apply = new ApplyBulkRatePlanFromTemplateUseCase(
      propertyRepository,
      flakyRates,
      permissionChecker,
      idGenerator,
      outbox,
      auditLogRepository,
      tokens,
      preview,
    );

    // Wipe TARGET_CUSTOM plan content difference by deleting and leaving two missing
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.rateDowModifier.deleteMany({
        where: { tenantId: TENANT, ratePlan: { unitId: TARGET_CUSTOM } },
      });
      await tx.rateSeason.deleteMany({
        where: { tenantId: TENANT, ratePlan: { unitId: TARGET_CUSTOM } },
      });
      await tx.ratePlan.deleteMany({
        where: { tenantId: TENANT, unitId: TARGET_CUSTOM },
      });
    });

    const previewed = await preview.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET_CUSTOM, freshMissing],
        mode: "skip_customized",
      },
      admin,
    );
    expect(previewed.isSuccess).toBe(true);
    expect(previewed.getValue().applyCount).toBe(2);

    const applied = await apply.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: previewed.getValue().confirmationToken,
      },
      admin,
    );
    expect(applied.isFailure).toBe(true);

    const afterCustom = await ratePlanRepository.findByUnitId(TARGET_CUSTOM, TENANT);
    const afterFresh = await ratePlanRepository.findByUnitId(freshMissing, TENANT);
    expect(afterCustom).toBeNull();
    expect(afterFresh).toBeNull();
  });
});
