/**
 * F4.1 extras appended conceptually into F4 verification — property ownership cases.
 * Invoked from run-fiscal-f4 or run standalone after migration.
 */
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { Money, Payment, PaymentAllocation, ValidationError } from "@hcp/domain";
import {
  assertNotTalosProductionDatabase,
} from "../src/safety/databaseTargetGuard.js";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
  throw new Error("Requires ALLOW_TALOS_PRODUCTION_DB_MUTATION=true");
}

const privileged =
  process.env.MIGRATION_DIRECT_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";
const runtimeDirect =
  process.env.RUNTIME_DIRECT_URL?.trim() ||
  process.env.RUNTIME_DATABASE_URL?.trim() ||
  "";

assertNotTalosProductionDatabase(privileged, "f41-verify-admin");
assertNotTalosProductionDatabase(runtimeDirect, "f41-verify-runtime");

process.env.RUNTIME_DATABASE_URL = runtimeDirect;
process.env.DATABASE_URL = runtimeDirect;
process.env.DIRECT_URL = runtimeDirect;

const { PrismaPaymentSettlementRepository, PrismaPaymentRepository } =
  await import("../src/repositories/billing/PaymentRepositories.js");
const { withTenantTransaction } = await import("../src/client.js");

const RUN_ID = `integration_payments_f41_${randomUUID()}`;

async function main() {
  const report: Record<string, unknown> = {
    runId: RUN_ID,
    status: "RUNNING",
    results: {},
    cleanup: "PENDING",
    issues: [] as string[],
  };

  const admin = new PrismaClient({ datasources: { db: { url: privileged } } });
  const settlement = new PrismaPaymentSettlementRepository();
  const payments = new PrismaPaymentRepository();

  const tenantA = randomUUID();
  const propertyA = randomUUID();
  const propertyB = randomUUID();
  const unitA = randomUUID();
  const unitB = randomUUID();
  const bookingA = randomUUID();
  const bookingB = randomUUID();
  const folioA = randomUUID();
  const folioB = randomUUID();
  const actorUserId = randomUUID();

  async function cleanup() {
    try {
      await admin.auditLog.deleteMany({ where: { actorId: actorUserId } });
      await admin.tenant.deleteMany({ where: { id: tenantA } });
      await admin.user.deleteMany({ where: { id: actorUserId } });
      report.cleanup = { status: "COMPLETE" };
    } catch (e) {
      report.cleanup = {
        status: "LEFT_ISOLATED",
        error: e instanceof Error ? e.message : String(e),
        tenantA,
        actorUserId,
      };
    }
  }

  const audit = (resourceId: string, action: string) => ({
    tenantId: tenantA,
    actorId: actorUserId,
    action,
    resourceType: "Payment",
    resourceId,
    metadata: { runId: RUN_ID },
    ipAddress: null,
  });

  try {
    await admin.tenant.create({
      data: {
        id: tenantA,
        name: `F41 ${RUN_ID.slice(-8)}`,
        slug: `f41-${RUN_ID.slice(-10)}`,
        status: "active",
        timezone: "Europe/Athens",
        defaultLocale: "en",
        defaultCurrency: "EUR",
        settings: {},
      },
    });
    await admin.user.create({
      data: {
        id: actorUserId,
        email: `f41-${RUN_ID.slice(-8)}@integration.payments.test`,
        name: "F41 Actor",
        passwordHash: null,
      },
    });

    const holdA = randomUUID();
    const holdB = randomUUID();
    const quoteA = randomUUID();
    const quoteB = randomUUID();
    const snapA = randomUUID();
    const snapB = randomUUID();

    await withTenantTransaction(tenantA, async (tx) => {
      await tx.property.create({
        data: {
          id: propertyA,
          tenantId: tenantA,
          name: "Prop A",
          slug: `f41a-${RUN_ID.slice(-8)}`,
          status: "active",
          timezone: "Europe/Athens",
          checkInTime: "15:00",
          checkOutTime: "11:00",
          cancellationPolicyType: "moderate",
        },
      });
      await tx.property.create({
        data: {
          id: propertyB,
          tenantId: tenantA,
          name: "Prop B",
          slug: `f41b-${RUN_ID.slice(-8)}`,
          status: "active",
          timezone: "Europe/Athens",
          checkInTime: "15:00",
          checkOutTime: "11:00",
          cancellationPolicyType: "moderate",
        },
      });
      await tx.unit.create({
        data: {
          id: unitA,
          tenantId: tenantA,
          propertyId: propertyA,
          name: "Unit A",
          slug: `f41ua-${RUN_ID.slice(-8)}`,
          maxGuests: 2,
          status: "active",
        },
      });
      await tx.unit.create({
        data: {
          id: unitB,
          tenantId: tenantA,
          propertyId: propertyB,
          name: "Unit B",
          slug: `f41ub-${RUN_ID.slice(-8)}`,
          maxGuests: 2,
          status: "active",
        },
      });
      for (const unitId of [unitA, unitB]) {
        await tx.ratePlan.create({
          data: {
            id: randomUUID(),
            tenantId: tenantA,
            unitId,
            baseNightlyAmount: "100.0000",
            currency: "EUR",
          },
        });
        await tx.unitAvailabilityRule.create({
          data: { id: randomUUID(), tenantId: tenantA, unitId },
        });
      }

      for (const [holdId, quoteId, snapId, bookingId, propId, unitId, folioId, key] of [
        [holdA, quoteA, snapA, bookingA, propertyA, unitA, folioA, "primary"],
        [holdB, quoteB, snapB, bookingB, propertyB, unitB, folioB, "primary-b"],
      ] as const) {
        await tx.bookingHold.create({
          data: {
            id: holdId,
            tenantId: tenantA,
            propertyId: propId,
            unitId,
            checkIn: new Date("2027-01-10"),
            checkOut: new Date("2027-01-12"),
            guestCount: 2,
            status: "converted",
            expiresAt: new Date("2028-01-01T00:00:00.000Z"),
          },
        });
        await tx.quote.create({
          data: {
            id: quoteId,
            tenantId: tenantA,
            propertyId: propId,
            unitId,
            holdId,
            snapshotId: snapId,
            snapshot: { runId: RUN_ID },
            currency: "EUR",
            totalAmount: "200.0000",
            expiresAt: new Date("2028-01-01T00:00:00.000Z"),
          },
        });
        await tx.booking.create({
          data: {
            id: bookingId,
            tenantId: tenantA,
            propertyId: propId,
            unitId,
            holdId,
            quoteId,
            quoteSnapshotId: snapId,
            checkIn: new Date("2027-01-10"),
            checkOut: new Date("2027-01-12"),
            guestCount: 2,
            guestName: "Guest",
            guestEmail: `g-${key}@test.local`,
            status: "confirmed",
            confirmationMode: "manual",
            currency: "EUR",
            totalAmount: "200.0000",
            confirmedAt: new Date(),
          },
        });
        await tx.folio.create({
          data: {
            id: folioId,
            tenantId: tenantA,
            bookingId,
            folioKey: key,
            currency: "EUR",
            status: "open",
          },
        });
      }
    });

    // A — unbooked payment visible under A only
    const unbooked = Payment.create({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      currency: "EUR",
      amount: Money.create("200.0000", "EUR"),
      status: "SUCCEEDED",
      method: "BANK_TRANSFER",
      collectionSource: "PROPERTY",
      idempotencyKey: `${RUN_ID}:unbooked`,
      succeededEventDeliveryResourceId: randomUUID(),
    });
    await settlement.recordPaymentAtomic({
      payment: unbooked,
      domainEvents: unbooked.pullDomainEvents(),
      auditEntry: audit(unbooked.id, "payment.recorded"),
    });
    const listA = await payments.listByTenant(tenantA, { propertyId: propertyA });
    const listB = await payments.listByTenant(tenantA, { propertyId: propertyB });
    (report.results as Record<string, unknown>).unbookedVisibility = {
      inA: listA.some((p) => p.id === unbooked.id),
      inB: listB.some((p) => p.id === unbooked.id),
    };

    // B — booking match succeeds
    const matched = Payment.create({
      id: randomUUID(),
      tenantId: tenantA,
      propertyId: propertyA,
      bookingId: bookingA,
      currency: "EUR",
      amount: Money.create("50.0000", "EUR"),
      status: "SUCCEEDED",
      method: "CASH",
      collectionSource: "PROPERTY",
      idempotencyKey: `${RUN_ID}:matched`,
      succeededEventDeliveryResourceId: randomUUID(),
    });
    await settlement.recordPaymentAtomic({
      payment: matched,
      domainEvents: matched.pullDomainEvents(),
      auditEntry: audit(matched.id, "payment.recorded"),
    });
    (report.results as Record<string, unknown>).bookingMatch = { ok: true };

    // C — mismatched booking rejected
    let mismatchRejected = false;
    try {
      const mismatched = Payment.create({
        id: randomUUID(),
        tenantId: tenantA,
        propertyId: propertyA,
        bookingId: bookingB,
        currency: "EUR",
        amount: Money.create("10.0000", "EUR"),
        status: "SUCCEEDED",
        method: "CASH",
        collectionSource: "PROPERTY",
        idempotencyKey: `${RUN_ID}:mismatch`,
        succeededEventDeliveryResourceId: randomUUID(),
      });
      await settlement.recordPaymentAtomic({
        payment: mismatched,
        domainEvents: [],
        auditEntry: audit(mismatched.id, "payment.recorded"),
      });
    } catch (e) {
      mismatchRejected =
        e instanceof ValidationError ||
        (e instanceof Error && /propertyId must match|Booking/i.test(e.message));
    }
    (report.results as Record<string, unknown>).bookingMismatch = { mismatchRejected };

    // D — cross-property allocation rejected
    let crossAllocRejected = false;
    try {
      const a = PaymentAllocation.create({
        id: randomUUID(),
        tenantId: tenantA,
        paymentId: unbooked.id,
        folioId: folioB,
        allocatedAmount: Money.create("10.0000", "EUR"),
        paymentCurrency: "EUR",
      });
      await settlement.allocateAtomic({
        allocation: a,
        domainEvents: [],
        auditEntry: audit(unbooked.id, "payment.allocated"),
      });
    } catch (e) {
      crossAllocRejected =
        e instanceof ValidationError ||
        (e instanceof Error && /across properties/i.test(e.message));
    }
    (report.results as Record<string, unknown>).crossPropertyAllocation = {
      crossAllocRejected,
    };

    const uv = report.results.unbookedVisibility as Record<string, unknown>;
    const mm = report.results.bookingMismatch as Record<string, unknown>;
    const ca = report.results.crossPropertyAllocation as Record<string, unknown>;
    report.status =
      uv.inA === true &&
      uv.inB === false &&
      mm.mismatchRejected === true &&
      ca.crossAllocRejected === true
        ? "PASS"
        : "FAILED";
  } catch (error) {
    report.status = "FAILED";
    (report.issues as string[]).push(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await cleanup();
    await admin.$disconnect();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
