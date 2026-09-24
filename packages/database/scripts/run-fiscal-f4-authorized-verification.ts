/**
 * F4 authorized Talos verification: payment idempotency, allocation/refund/reversal
 * concurrency, RLS under talos_runtime. Isolated tenants only.
 *
 * Requires ALLOW_TALOS_PRODUCTION_DB_MUTATION=true
 * Uses RUNTIME_DIRECT_URL for app-role proofs; privileged URL for bootstrap/cleanup.
 */
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  Money,
  Payment,
  PaymentAllocation,
  PaymentAllocationReversal,
  Refund,
  ValidationError,
} from "@hcp/domain";
import {
  assertNotTalosProductionDatabase,
  extractSupabaseProjectRef,
  TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
} from "../src/safety/databaseTargetGuard.js";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

const RUN_ID = `integration_payments_f4_${randomUUID()}`;

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

if (!privileged || !runtimeDirect) {
  throw new Error("Need privileged DIRECT_URL and RUNTIME_DIRECT_URL");
}

assertNotTalosProductionDatabase(privileged, "f4-verify-admin");
assertNotTalosProductionDatabase(runtimeDirect, "f4-verify-runtime");

process.env.RUNTIME_DATABASE_URL = runtimeDirect;
process.env.DATABASE_URL = runtimeDirect;
process.env.DIRECT_URL = runtimeDirect;

const { PrismaPaymentSettlementRepository } = await import(
  "../src/repositories/billing/PaymentRepositories.js"
);
const { withTenantTransaction } = await import("../src/client.js");

type ResultMap = Record<string, unknown>;

async function main() {
  const report: ResultMap = {
    runId: RUN_ID,
    status: "RUNNING",
    databaseTarget: {
      projectRef: extractSupabaseProjectRef(privileged),
      matchesExpectedTalos:
        extractSupabaseProjectRef(privileged) ===
        TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
    },
    results: {},
    createdIds: {},
    cleanup: "PENDING",
    issues: [] as string[],
  };

  const admin = new PrismaClient({
    datasources: { db: { url: privileged } },
  });
  const runtime = new PrismaClient({
    datasources: { db: { url: runtimeDirect } },
  });
  const settlement = new PrismaPaymentSettlementRepository();

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const propertyA = randomUUID();
  const propertyB = randomUUID();
  const unitA = randomUUID();
  const bookingA = randomUUID();
  const folioA = randomUUID();
  const folioB = randomUUID();
  const actorUserId = randomUUID();

  (report.createdIds as ResultMap) = {
    tenantA,
    tenantB,
    folioA,
    actorUserId,
  };

  async function cleanup() {
    try {
      await admin.auditLog.deleteMany({ where: { actorId: actorUserId } });
      await admin.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
      await admin.user.deleteMany({ where: { id: actorUserId } });
      report.cleanup = { status: "COMPLETE", tenantsDeleted: 2 };
    } catch (e) {
      report.cleanup = {
        status: "LEFT_ISOLATED",
        error: e instanceof Error ? e.message : String(e),
        createdIds: report.createdIds,
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
    const role = await runtime.$queryRaw<
      Array<{ current_user: string; rolbypassrls: boolean }>
    >`
      SELECT current_user::text, r.rolbypassrls
      FROM pg_roles r WHERE r.rolname = current_user
    `;
    if (role[0]?.current_user !== "talos_runtime" || role[0]?.rolbypassrls) {
      throw new Error(`Bad runtime role: ${JSON.stringify(role[0])}`);
    }
    (report.results as ResultMap).runtimeRole = role[0];

    for (const [id, slug] of [
      [tenantA, `f4-a-${RUN_ID.slice(-10)}`],
      [tenantB, `f4-b-${RUN_ID.slice(-10)}`],
    ] as const) {
      await admin.tenant.create({
        data: {
          id,
          name: `F4 ${slug}`,
          slug,
          status: "active",
          timezone: "Europe/Athens",
          defaultLocale: "en",
          defaultCurrency: "EUR",
          settings: {},
        },
      });
    }
    await admin.user.create({
      data: {
        id: actorUserId,
        email: `f4-actor-${RUN_ID.slice(-8)}@integration.payments.test`,
        name: "F4 Actor",
        passwordHash: null,
      },
    });

    const holdId = randomUUID();
    const quoteId = randomUUID();
    const snapshotId = randomUUID();

    await withTenantTransaction(tenantA, async (tx) => {
      await tx.property.create({
        data: {
          id: propertyA,
          tenantId: tenantA,
          name: "F4 Prop A",
          slug: `f4pa-${RUN_ID.slice(-8)}`,
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
          slug: `f4ua-${RUN_ID.slice(-8)}`,
          maxGuests: 4,
          status: "active",
        },
      });
      await tx.ratePlan.create({
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          unitId: unitA,
          baseNightlyAmount: "100.0000",
          currency: "EUR",
        },
      });
      await tx.unitAvailabilityRule.create({
        data: { id: randomUUID(), tenantId: tenantA, unitId: unitA },
      });
      await tx.bookingHold.create({
        data: {
          id: holdId,
          tenantId: tenantA,
          propertyId: propertyA,
          unitId: unitA,
          checkIn: new Date("2026-12-10"),
          checkOut: new Date("2026-12-12"),
          guestCount: 2,
          status: "converted",
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        },
      });
      await tx.quote.create({
        data: {
          id: quoteId,
          tenantId: tenantA,
          propertyId: propertyA,
          unitId: unitA,
          holdId,
          snapshotId,
          snapshot: { runId: RUN_ID },
          currency: "EUR",
          totalAmount: new Prisma.Decimal("200.0000"),
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        },
      });
      await tx.booking.create({
        data: {
          id: bookingA,
          tenantId: tenantA,
          propertyId: propertyA,
          unitId: unitA,
          holdId,
          quoteId,
          quoteSnapshotId: snapshotId,
          checkIn: new Date("2026-12-10"),
          checkOut: new Date("2026-12-12"),
          guestCount: 2,
          guestName: "F4 Guest",
          guestEmail: `f4-${RUN_ID.slice(-8)}@integration.payments.test`,
          status: "confirmed",
          confirmationMode: "manual",
          currency: "EUR",
          totalAmount: new Prisma.Decimal("200.0000"),
          confirmedAt: new Date(),
        },
      });
      await tx.folio.create({
        data: {
          id: folioA,
          tenantId: tenantA,
          bookingId: bookingA,
          folioKey: "primary",
          currency: "EUR",
          status: "open",
          label: RUN_ID,
        },
      });
      await tx.folioLine.create({
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          folioId: folioA,
          lineType: "accommodation",
          description: "Stay",
          amount: new Prisma.Decimal("200.0000"),
          currency: "EUR",
          sourceType: "manual",
          sourceId: bookingA,
          sourceLineRef: "stay",
          sortOrder: 0,
          postedAt: new Date(),
        },
      });
      await tx.folio.create({
        data: {
          id: folioB,
          tenantId: tenantA,
          bookingId: bookingA,
          folioKey: "extras",
          currency: "EUR",
          status: "open",
          label: "extras",
        },
      });
    });

    await withTenantTransaction(tenantB, async (tx) => {
      await tx.property.create({
        data: {
          id: propertyB,
          tenantId: tenantB,
          name: "F4 Prop B",
          slug: `f4pb-${RUN_ID.slice(-8)}`,
          status: "active",
          timezone: "Europe/Athens",
          checkInTime: "15:00",
          checkOutTime: "11:00",
          cancellationPolicyType: "moderate",
        },
      });
    });

    // A — Payment idempotency concurrency (distinct ids, same key)
    const idemKey = `${RUN_ID}:pay:idem`;
    const makePayment = () =>
      Payment.create({
        id: randomUUID(),
        tenantId: tenantA,
        currency: "EUR",
        amount: Money.create("100.0000", "EUR"),
        status: "SUCCEEDED",
        method: "CASH",
        collectionSource: "PROPERTY",
        bookingId: bookingA,
        idempotencyKey: idemKey,
        metadata: { runId: RUN_ID },
        succeededEventDeliveryResourceId: randomUUID(),
      });

    const idemSettled = await Promise.allSettled(
      [0, 1, 2, 3, 4].map(async () => {
        const p = makePayment();
        return settlement.recordPaymentAtomic({
          payment: p,
          domainEvents: p.pullDomainEvents(),
          auditEntry: audit(p.id, "payment.recorded"),
        });
      }),
    );
    const idemOk = idemSettled.filter((r) => r.status === "fulfilled");
    const idemIds = new Set(
      idemOk.map(
        (r) =>
          (r as PromiseFulfilledResult<Payment>).value.id,
      ),
    );
    const idemCount = await withTenantTransaction(tenantA, (tx) =>
      tx.payment.count({
        where: { tenantId: tenantA, idempotencyKey: idemKey },
      }),
    );
    (report.results as ResultMap).paymentIdempotency = {
      fulfilled: idemOk.length,
      distinctIds: idemIds.size,
      dbRows: idemCount,
      exactlyOne: idemCount === 1 && idemIds.size === 1,
    };

    // Conflicting idempotency
    let conflictRejected = false;
    try {
      const bad = Payment.create({
        id: randomUUID(),
        tenantId: tenantA,
        currency: "EUR",
        amount: Money.create("50.0000", "EUR"),
        status: "SUCCEEDED",
        method: "CASH",
        collectionSource: "PROPERTY",
        bookingId: bookingA,
        idempotencyKey: idemKey,
      });
      await settlement.recordPaymentAtomic({
        payment: bad,
        domainEvents: [],
        auditEntry: audit(bad.id, "payment.recorded"),
      });
    } catch (e) {
      conflictRejected =
        e instanceof ValidationError ||
        (e instanceof Error && /idempotency|conflict|P2002/i.test(e.message));
    }
    (report.results as ResultMap).conflictingIdempotency = { conflictRejected };

    // B — Allocation race: payment 100, 3×60
    const racePay = Payment.create({
      id: randomUUID(),
      tenantId: tenantA,
      currency: "EUR",
      amount: Money.create("100.0000", "EUR"),
      status: "SUCCEEDED",
      method: "CARD",
      collectionSource: "DIRECT",
      bookingId: bookingA,
      idempotencyKey: `${RUN_ID}:alloc-race`,
    });
    await settlement.recordPaymentAtomic({
      payment: racePay,
      domainEvents: racePay.pullDomainEvents(),
      auditEntry: audit(racePay.id, "payment.recorded"),
    });

    const allocSettled = await Promise.allSettled(
      [0, 1, 2].map(async (i) => {
        const a = PaymentAllocation.create({
          id: randomUUID(),
          tenantId: tenantA,
          paymentId: racePay.id,
          folioId: folioA,
          allocatedAmount: Money.create("60.0000", "EUR"),
          paymentCurrency: "EUR",
          createdAt: new Date(),
          reason: `race-${i}`,
        });
        return settlement.allocateAtomic({
          allocation: a,
          domainEvents: [],
          auditEntry: audit(racePay.id, "payment.allocated"),
        });
      }),
    );
    const allocOk = allocSettled.filter((r) => r.status === "fulfilled").length;
    const allocFail = allocSettled.filter((r) => r.status === "rejected").length;
    const allocSum = await withTenantTransaction(tenantA, async (tx) => {
      const agg = await tx.paymentAllocation.aggregate({
        where: { tenantId: tenantA, paymentId: racePay.id },
        _sum: { allocatedAmount: true },
      });
      return Number(agg._sum.allocatedAmount?.toString() ?? "0");
    });
    (report.results as ResultMap).allocationRace = {
      fulfilled: allocOk,
      rejected: allocFail,
      allocatedSum: allocSum,
      withinCap: allocSum <= 100 + 1e-9,
      overAllocationPossible: allocSum > 100 + 1e-9,
    };

    // D — Refund race on a fresh payment 100, 3×60
    const refundPay = Payment.create({
      id: randomUUID(),
      tenantId: tenantA,
      currency: "EUR",
      amount: Money.create("100.0000", "EUR"),
      status: "SUCCEEDED",
      method: "BANK_TRANSFER",
      collectionSource: "PROPERTY",
      bookingId: bookingA,
      idempotencyKey: `${RUN_ID}:refund-race`,
    });
    await settlement.recordPaymentAtomic({
      payment: refundPay,
      domainEvents: refundPay.pullDomainEvents(),
      auditEntry: audit(refundPay.id, "payment.recorded"),
    });
    const refundSettled = await Promise.allSettled(
      [0, 1, 2].map(async (i) => {
        const r = Refund.create({
          id: randomUUID(),
          tenantId: tenantA,
          paymentId: refundPay.id,
          amount: Money.create("60.0000", "EUR"),
          paymentCurrency: "EUR",
          status: "SUCCEEDED",
          reason: `refund-race-${i}`,
          idempotencyKey: `${RUN_ID}:refund:${i}`,
        });
        return settlement.refundAtomic({
          refund: r,
          domainEvents: r.pullDomainEvents(),
          auditEntry: audit(refundPay.id, "payment.refunded"),
        });
      }),
    );
    const refundOk = refundSettled.filter((r) => r.status === "fulfilled").length;
    const refundFail = refundSettled.filter((r) => r.status === "rejected").length;
    const refundSum = await withTenantTransaction(tenantA, async (tx) => {
      const agg = await tx.paymentRefund.aggregate({
        where: {
          tenantId: tenantA,
          paymentId: refundPay.id,
          status: "SUCCEEDED",
        },
        _sum: { amount: true },
      });
      return Number(agg._sum.amount?.toString() ?? "0");
    });
    (report.results as ResultMap).refundRace = {
      fulfilled: refundOk,
      rejected: refundFail,
      refundedSum: refundSum,
      withinCap: refundSum <= 100 + 1e-9,
      overRefundPossible: refundSum > 100 + 1e-9,
    };

    // E — Reversal race
    const revPay = Payment.create({
      id: randomUUID(),
      tenantId: tenantA,
      currency: "EUR",
      amount: Money.create("80.0000", "EUR"),
      status: "SUCCEEDED",
      method: "CASH",
      collectionSource: "PROPERTY",
      bookingId: bookingA,
      idempotencyKey: `${RUN_ID}:rev-race`,
    });
    await settlement.recordPaymentAtomic({
      payment: revPay,
      domainEvents: revPay.pullDomainEvents(),
      auditEntry: audit(revPay.id, "payment.recorded"),
    });
    const revAlloc = PaymentAllocation.create({
      id: randomUUID(),
      tenantId: tenantA,
      paymentId: revPay.id,
      folioId: folioA,
      allocatedAmount: Money.create("80.0000", "EUR"),
      paymentCurrency: "EUR",
      createdAt: new Date(),
    });
    await settlement.allocateAtomic({
      allocation: revAlloc,
      domainEvents: [],
      auditEntry: audit(revPay.id, "payment.allocated"),
    });
    const revSettled = await Promise.allSettled(
      [0, 1, 2].map(async (i) => {
        const rev = PaymentAllocationReversal.create({
          id: randomUUID(),
          tenantId: tenantA,
          paymentId: revPay.id,
          allocationId: revAlloc.id,
          reversedAmount: Money.create("50.0000", "EUR"),
          allocationCurrency: "EUR",
          reason: `rev-${i}`,
          createdAt: new Date(),
          metadata: { idempotencyKey: `${RUN_ID}:rev:${i}` },
        });
        return settlement.reverseAllocationAtomic({
          reversal: rev,
          domainEvents: [],
          auditEntry: audit(revPay.id, "payment.allocation_reversed"),
        });
      }),
    );
    const revOk = revSettled.filter((r) => r.status === "fulfilled").length;
    const revFail = revSettled.filter((r) => r.status === "rejected").length;
    const revSum = await withTenantTransaction(tenantA, async (tx) => {
      const agg = await tx.paymentAllocationReversal.aggregate({
        where: { tenantId: tenantA, allocationId: revAlloc.id },
        _sum: { reversedAmount: true },
      });
      return Number(agg._sum.reversedAmount?.toString() ?? "0");
    });
    (report.results as ResultMap).reversalRace = {
      fulfilled: revOk,
      rejected: revFail,
      reversedSum: revSum,
      withinCap: revSum <= 80 + 1e-9,
      overReversalPossible: revSum > 80 + 1e-9,
    };

    // F — RLS
    const rls = await withTenantTransaction(tenantB, async (tx) => {
      const payments = await tx.payment.findMany({
        where: { tenantId: tenantA },
      });
      let crossAllocRejected = false;
      try {
        await tx.paymentAllocation.create({
          data: {
            id: randomUUID(),
            tenantId: tenantA,
            paymentId: racePay.id,
            folioId: folioA,
            allocatedAmount: new Prisma.Decimal("1.0000"),
            currency: "EUR",
          },
        });
      } catch {
        crossAllocRejected = true;
      }
      return {
        cannotSeeAPayments: payments.length === 0,
        crossAllocRejected,
      };
    });
    const missingCtx = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', '', true)`;
      const n = await tx.payment.count();
      return { visibleWithoutTenant: n };
    });
    (report.results as ResultMap).rls = {
      ...rls,
      missingTenantFailsClosed: missingCtx.visibleWithoutTenant === 0,
      isolationProven:
        rls.cannotSeeAPayments &&
        rls.crossAllocRejected &&
        missingCtx.visibleWithoutTenant === 0,
    };

    const idem = report.results.paymentIdempotency as ResultMap;
    const alloc = report.results.allocationRace as ResultMap;
    const refund = report.results.refundRace as ResultMap;
    const rev = report.results.reversalRace as ResultMap;
    const rlsR = report.results.rls as ResultMap;

    report.status =
      idem.exactlyOne &&
      conflictRejected &&
      alloc.withinCap &&
      !alloc.overAllocationPossible &&
      refund.withinCap &&
      !refund.overRefundPossible &&
      rev.withinCap &&
      !rev.overReversalPossible &&
      rlsR.isolationProven
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
    await runtime.$disconnect();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
