/**
 * F3.1 authorized Talos verification:
 * - allocation + credit concurrency via production issueAtomic
 * - RLS proof on talos_runtime (rolbypassrls=false)
 * - tenant GUC pooling isolation
 *
 * Requires ALLOW_TALOS_PRODUCTION_DB_MUTATION=true
 * Uses RUNTIME_* for app-role proofs; privileged URL for bootstrap/cleanup only.
 * Never truncates; cleanup scoped to created tenant IDs.
 */
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  FiscalDocument,
  FiscalDocumentLine,
  FiscalLineAllocation,
} from "@hcp/domain";
import {
  assertNotTalosProductionDatabase,
  extractSupabaseProjectRef,
  isTalosProductionDatabaseUrl,
  TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
} from "../src/safety/databaseTargetGuard.js";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

const RUN_ID = `integration_fiscal_f31_${randomUUID()}`;

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

assertNotTalosProductionDatabase(privileged, "f31-verify-admin");
assertNotTalosProductionDatabase(runtimeDirect, "f31-verify-runtime");

// Force runtime client singleton to use non-bypass role.
process.env.RUNTIME_DATABASE_URL = runtimeDirect;
process.env.DATABASE_URL = runtimeDirect;
process.env.DIRECT_URL = runtimeDirect;

const { PrismaFiscalDocumentRepository } = await import(
  "../src/repositories/fiscal/FiscalDocumentRepositories.js"
);
const { withTenantTransaction } = await import("../src/client.js");

type ResultMap = Record<string, unknown>;

function issuerSnap(bizId: string, propertyId: string) {
  return {
    businessFiscalProfileId: bizId,
    propertyId,
    legalName: "F31 Hotel SA",
    tradeName: null,
    country: "GR",
    vatNumber: "123456789",
    address: {
      line1: "1 Test St",
      line2: null,
      city: "Athens",
      region: null,
      postalCode: "10552",
      country: "GR",
    },
    establishmentLocationId: "gr-mainland",
    establishmentCode: null,
    fiscalJurisdiction: "GR",
    accommodationType: "hotel",
    propertyClassification: "hotel_stars_3",
    floorAreaSqm: null,
    snappedAt: new Date().toISOString(),
  };
}

function customerSnap(custId: string) {
  return {
    customerBillingProfileId: custId,
    type: "MINIMAL" as const,
    legalName: "Retail Guest",
    vatNumber: null,
    country: "GR",
    address: null,
    email: null,
    snappedAt: new Date().toISOString(),
  };
}

async function main() {
  const report: ResultMap = {
    runId: RUN_ID,
    status: "RUNNING",
    databaseTarget: {
      projectRef: extractSupabaseProjectRef(privileged),
      matchesExpectedTalos:
        extractSupabaseProjectRef(privileged) ===
        TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
      isTalosProductionIdentity: isTalosProductionDatabaseUrl(privileged),
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
  const docs = new PrismaFiscalDocumentRepository();

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const propertyA = randomUUID();
  const propertyB = randomUUID();
  const unitA = randomUUID();
  const bookingA = randomUUID();
  const folioA = randomUUID();
  const folioLineA = randomUUID();
  const seriesA = randomUUID();
  const seriesCreditA = randomUUID();
  const bizA = randomUUID();
  const custA = randomUUID();
  const actorUserId = randomUUID();
  const createdDocIds: string[] = [];

  (report.createdIds as ResultMap) = {
    tenantA,
    tenantB,
    propertyA,
    propertyB,
    folioA,
    folioLineA,
    seriesA,
    seriesCreditA,
    bizA,
    actorUserId,
  };

  async function cleanup() {
    // ISSUED fiscal_documents cannot be deleted (immutability trigger). Supabase
    // also denies session_replication_role. Leave tenants isolated if cascade fails.
    try {
      await admin.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
      await admin.user.deleteMany({ where: { id: actorUserId } });
      report.cleanup = { status: "COMPLETE", tenantsDeleted: 2 };
    } catch (e) {
      report.cleanup = {
        status: "LEFT_ISOLATED",
        error: e instanceof Error ? e.message : String(e),
        createdIds: report.createdIds,
        documentIds: createdDocIds,
      };
    }
  }

  try {
    // --- Role proof ---
    const role = await runtime.$queryRaw<
      Array<{
        current_user: string;
        rolbypassrls: boolean;
        rolsuper: boolean;
      }>
    >`
      SELECT current_user::text, r.rolbypassrls, r.rolsuper
      FROM pg_roles r WHERE r.rolname = current_user
    `;
    const roleRow = role[0]!;
    if (roleRow.rolbypassrls || roleRow.current_user !== "talos_runtime") {
      throw new Error(
        `Runtime role invalid: user=${roleRow.current_user} bypass=${roleRow.rolbypassrls}`,
      );
    }
    (report.results as ResultMap).runtimeRole = {
      currentUser: roleRow.current_user,
      rolbypassrls: roleRow.rolbypassrls,
      rolsuper: roleRow.rolsuper,
    };

    // --- Bootstrap tenants (no RLS on tenants) ---
    for (const [id, slug] of [
      [tenantA, `f31-a-${RUN_ID.slice(-10)}`],
      [tenantB, `f31-b-${RUN_ID.slice(-10)}`],
    ] as const) {
      await admin.tenant.create({
        data: {
          id,
          name: `F31 ${slug}`,
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
        email: `f31-actor-${RUN_ID.slice(-8)}@integration.fiscal.test`,
        name: "F31 Actor",
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
          name: "F31 Prop A",
          slug: `f31pa-${RUN_ID.slice(-8)}`,
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
          slug: `f31ua-${RUN_ID.slice(-8)}`,
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
        data: {
          id: randomUUID(),
          tenantId: tenantA,
          unitId: unitA,
        },
      });
      await tx.bookingHold.create({
        data: {
          id: holdId,
          tenantId: tenantA,
          propertyId: propertyA,
          unitId: unitA,
          checkIn: new Date("2026-12-01"),
          checkOut: new Date("2026-12-03"),
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
          checkIn: new Date("2026-12-01"),
          checkOut: new Date("2026-12-03"),
          guestCount: 2,
          guestName: "F31 Guest",
          guestEmail: `f31-${RUN_ID.slice(-8)}@integration.fiscal.test`,
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
          id: folioLineA,
          tenantId: tenantA,
          folioId: folioA,
          lineType: "accommodation",
          description: "Stay",
          amount: new Prisma.Decimal("100.0000"),
          currency: "EUR",
          sourceType: "manual",
          sourceId: bookingA,
          sourceLineRef: "stay",
          sortOrder: 0,
          postedAt: new Date(),
        },
      });
      await tx.businessFiscalProfile.create({
        data: {
          id: bizA,
          tenantId: tenantA,
          propertyId: propertyA,
          legalName: "F31 Hotel SA",
          country: "GR",
          vatNumber: "123456789",
          addressLine1: "1 Test St",
          addressCity: "Athens",
          addressPostalCode: "10552",
          addressCountry: "GR",
          establishmentLocationId: "gr-mainland",
          establishmentInEligibleArea: false,
          servicePhysicallyExecutedInEligibleArea: false,
          fiscalJurisdiction: "GR",
          accommodationType: "hotel",
          propertyClassification: "hotel_stars_3",
          metadata: { runId: RUN_ID },
        },
      });
      await tx.customerBillingProfile.create({
        data: {
          id: custA,
          tenantId: tenantA,
          type: "INDIVIDUAL",
          legalName: "Retail Guest",
          country: "GR",
          addressLine1: "2 Test Ave",
          addressCity: "Athens",
          addressPostalCode: "10553",
          addressCountry: "GR",
        },
      });
      await tx.fiscalSeries.create({
        data: {
          id: seriesA,
          tenantId: tenantA,
          propertyId: propertyA,
          documentKind: "SERVICE_RECEIPT",
          seriesCode: "F31A",
          nextSequence: 1,
          active: true,
          metadata: { runId: RUN_ID },
        },
      });
      await tx.fiscalSeries.create({
        data: {
          id: seriesCreditA,
          tenantId: tenantA,
          propertyId: propertyA,
          documentKind: "RETAIL_CREDIT",
          seriesCode: "F31C",
          nextSequence: 1,
          active: true,
          metadata: { runId: RUN_ID },
        },
      });
    });

    await withTenantTransaction(tenantB, async (tx) => {
      await tx.property.create({
        data: {
          id: propertyB,
          tenantId: tenantB,
          name: "F31 Prop B",
          slug: `f31pb-${RUN_ID.slice(-8)}`,
          status: "active",
          timezone: "Europe/Athens",
          checkInTime: "15:00",
          checkOutTime: "11:00",
          cancellationPolicyType: "moderate",
        },
      });
    });

    async function issueViaRepo(opts: {
      allocate: string;
      idempotencyKey: string;
      documentId?: string;
    }) {
      const documentId = opts.documentId ?? randomUUID();
      const lineId = randomUUID();
      const allocId = randomUUID();
      const { document, lines } = FiscalDocument.createDraft({
        id: documentId,
        tenantId: tenantA,
        propertyId: propertyA,
        documentKind: "SERVICE_RECEIPT",
        seriesId: seriesA,
        seriesCode: "F31A",
        currency: "EUR",
        issuerSnapshot: issuerSnap(bizA, propertyA),
        customerSnapshot: customerSnap(custA),
        lines: [
          FiscalDocumentLine.create({
            id: lineId,
            tenantId: tenantA,
            fiscalDocumentId: documentId,
            sortOrder: 0,
            description: "Stay",
            quantity: "1.0000",
            unit: "night",
            netAmount: opts.allocate,
            vatAmount: "0.0000",
            levyAmount: "0.0000",
            grossAmount: opts.allocate,
            currency: "EUR",
            classificationKey: "accommodation",
            taxSnapshot: null,
            sourceFolioId: folioA,
            sourceFolioLineId: folioLineA,
            dailyUseProvenance: null,
            metadata: {},
          }),
        ],
        sourceBookingId: bookingA,
        metadata: { runId: RUN_ID },
      });
      await docs.saveDraft(document, lines);
      const allocation = FiscalLineAllocation.create({
        id: allocId,
        tenantId: tenantA,
        folioId: folioA,
        folioLineId: folioLineA,
        fiscalDocumentId: documentId,
        fiscalDocumentLineId: lineId,
        allocatedAmount: opts.allocate,
        currency: "EUR",
        createdAt: new Date(),
      });
      const result = await docs.issueAtomic({
        document,
        lines,
        allocations: [allocation],
        issuanceIdempotencyKey: opts.idempotencyKey,
        domainEvents: [],
        auditEntry: {
          tenantId: tenantA,
          actorId: actorUserId,
          action: "fiscal.document.issue",
          resourceType: "FiscalDocument",
          resourceId: documentId,
          metadata: { runId: RUN_ID },
          ipAddress: null,
        },
      });
      createdDocIds.push(result.document.id);
      return result;
    }

    // Sequential numbering
    const first = await issueViaRepo({
      allocate: "10.0000",
      idempotencyKey: `${RUN_ID}:seq:1`,
    });
    const second = await issueViaRepo({
      allocate: "10.0000",
      idempotencyKey: `${RUN_ID}:seq:2`,
    });
    (report.results as ResultMap).atomicNumbering = {
      first: first.document.sequenceNumber,
      second: second.document.sequenceNumber,
      sequential:
        first.document.sequenceNumber === 1 &&
        second.document.sequenceNumber === 2,
    };

    // Concurrent different intents
    const concurrent = await Promise.allSettled(
      [0, 1, 2, 3, 4].map((i) =>
        issueViaRepo({
          allocate: "5.0000",
          idempotencyKey: `${RUN_ID}:c:${i}`,
        }),
      ),
    );
    const concOk = concurrent.filter((r) => r.status === "fulfilled");
    const seqs = concOk
      .map(
        (r) =>
          (r as PromiseFulfilledResult<Awaited<ReturnType<typeof issueViaRepo>>>)
            .value.document.sequenceNumber!,
      )
      .sort((a, b) => a - b);
    (report.results as ResultMap).concurrencyDifferentIntents = {
      fulfilled: concOk.length,
      sequences: seqs,
      allUnique: new Set(seqs).size === seqs.length,
    };

    // Same idempotency key
    const sameKey = `${RUN_ID}:same`;
    const sameSettled = await Promise.allSettled(
      [0, 1, 2, 3, 4].map(() =>
        issueViaRepo({ allocate: "5.0000", idempotencyKey: sameKey }),
      ),
    );
    const sameFulfilled = sameSettled.filter((r) => r.status === "fulfilled");
    const sameIds = new Set(
      sameFulfilled.map(
        (r) =>
          (r as PromiseFulfilledResult<Awaited<ReturnType<typeof issueViaRepo>>>)
            .value.document.id,
      ),
    );
    const sameCount = await withTenantTransaction(tenantA, async (tx) =>
      tx.fiscalDocument.count({
        where: { tenantId: tenantA, issuanceIdempotencyKey: sameKey },
      }),
    );
    (report.results as ResultMap).concurrencySameIdempotency = {
      fulfilled: sameFulfilled.length,
      distinctDocuments: sameIds.size,
      dbRows: sameCount,
      exactlyOne: sameCount === 1 && sameIds.size === 1,
    };

    // Allocation over-cap concurrency: remaining after prior issues
    const allocatedBefore = await withTenantTransaction(tenantA, async (tx) => {
      const agg = await tx.fiscalLineAllocation.aggregate({
        where: { tenantId: tenantA, folioLineId: folioLineA },
        _sum: { allocatedAmount: true },
      });
      return Number(agg._sum.allocatedAmount?.toString() ?? "0");
    });
    // Folio line = 100; prior allocates: 10+10+5*5+5 = 50 if all succeeded for concurrent+seq+same
    const remaining = 100 - allocatedBefore;
    const attempt = Math.max(remaining, 1);
    // Launch 3 concurrent attempts each wanting `attempt` (only one should fit if remaining < 2*attempt)
    const overSettled = await Promise.allSettled(
      [0, 1, 2].map((i) =>
        issueViaRepo({
          allocate: attempt.toFixed(4),
          idempotencyKey: `${RUN_ID}:over:${i}`,
        }),
      ),
    );
    const overFulfilled = overSettled.filter((r) => r.status === "fulfilled").length;
    const overRejected = overSettled.filter((r) => r.status === "rejected").length;
    const allocatedAfter = await withTenantTransaction(tenantA, async (tx) => {
      const agg = await tx.fiscalLineAllocation.aggregate({
        where: { tenantId: tenantA, folioLineId: folioLineA },
        _sum: { allocatedAmount: true },
      });
      return Number(agg._sum.allocatedAmount?.toString() ?? "0");
    });
    (report.results as ResultMap).allocationConcurrency = {
      allocatedBefore,
      remaining,
      attemptEach: attempt,
      fulfilled: overFulfilled,
      rejected: overRejected,
      allocatedAfter,
      withinCap: allocatedAfter <= 100 + 1e-9,
      overAllocationPossible: allocatedAfter > 100 + 1e-9,
    };

    // Credit concurrency against first issued doc
    const originalId = first.document.id;
    async function issueCredit(gross: string, key: string) {
      const documentId = randomUUID();
      const lineId = randomUUID();
      const original = await docs.findById(tenantA, originalId);
      if (!original) throw new Error("original missing");
      const { document, lines } = FiscalDocument.createDraft({
        id: documentId,
        tenantId: tenantA,
        propertyId: propertyA,
        documentKind: "RETAIL_CREDIT",
        seriesId: seriesCreditA,
        seriesCode: "F31C",
        currency: "EUR",
        issuerSnapshot: issuerSnap(bizA, propertyA),
        customerSnapshot: original.document.customerSnapshot,
        lines: [
          FiscalDocumentLine.create({
            id: lineId,
            tenantId: tenantA,
            fiscalDocumentId: documentId,
            sortOrder: 0,
            description: "Credit",
            quantity: "1.0000",
            unit: null,
            netAmount: gross,
            vatAmount: "0.0000",
            levyAmount: "0.0000",
            grossAmount: gross,
            currency: "EUR",
            classificationKey: null,
            taxSnapshot: null,
            sourceFolioId: null,
            sourceFolioLineId: null,
            dailyUseProvenance: null,
            metadata: { creditOfDocumentId: originalId },
          }),
        ],
        correlation: {
          originalDocumentId: originalId,
          reason: "f31 verify",
          creditedScope: "partial",
        },
        metadata: { runId: RUN_ID },
      });
      await docs.saveDraft(document, lines);
      const result = await docs.issueAtomic({
        document,
        lines,
        allocations: [],
        issuanceIdempotencyKey: key,
        domainEvents: [],
        auditEntry: {
          tenantId: tenantA,
          actorId: actorUserId,
          action: "fiscal.document.issue",
          resourceType: "FiscalDocument",
          resourceId: documentId,
          metadata: { runId: RUN_ID },
          ipAddress: null,
        },
      });
      createdDocIds.push(result.document.id);
      return result;
    }

    const creditGross = first.document.totals.grossTotal; // 10.0000
    const creditSettled = await Promise.allSettled(
      [0, 1, 2].map((i) =>
        issueCredit(creditGross, `${RUN_ID}:credit:${i}`),
      ),
    );
    const creditOk = creditSettled.filter((r) => r.status === "fulfilled").length;
    const creditFail = creditSettled.filter((r) => r.status === "rejected").length;
    const creditedSum = await withTenantTransaction(tenantA, async (tx) => {
      const agg = await tx.fiscalDocument.aggregate({
        where: {
          tenantId: tenantA,
          originalDocumentId: originalId,
          status: "ISSUED",
        },
        _sum: { grossTotal: true },
      });
      return Number(agg._sum.grossTotal?.toString() ?? "0");
    });
    (report.results as ResultMap).creditConcurrency = {
      fulfilled: creditOk,
      rejected: creditFail,
      creditedSum,
      originalGross: Number(creditGross),
      withinCap: creditedSum <= Number(creditGross) + 1e-9,
    };

    // Rollback sequence
    const seriesBefore = await withTenantTransaction(tenantA, async (tx) =>
      tx.fiscalSeries.findUniqueOrThrow({ where: { id: seriesA } }),
    );
    let rolled = false;
    try {
      await withTenantTransaction(tenantA, async (tx) => {
        await tx.$queryRaw`
          SELECT next_sequence FROM fiscal_series WHERE id = ${seriesA}::uuid FOR UPDATE
        `;
        await tx.$executeRaw`
          UPDATE fiscal_series SET next_sequence = next_sequence + 1 WHERE id = ${seriesA}::uuid
        `;
        throw new Error("forced_rollback_after_allocation");
      });
    } catch (e) {
      rolled = e instanceof Error && e.message.includes("forced_rollback");
    }
    const seriesAfter = await withTenantTransaction(tenantA, async (tx) =>
      tx.fiscalSeries.findUniqueOrThrow({ where: { id: seriesA } }),
    );
    (report.results as ResultMap).rollback = {
      forcedErrorCaught: rolled,
      nextSequenceUnchanged:
        seriesBefore.nextSequence === seriesAfter.nextSequence,
    };

    // Immutability
    let bodyRejected = false;
    let lineRejected = false;
    let lineDeleteRejected = false;
    try {
      await withTenantTransaction(tenantA, async (tx) => {
        await tx.fiscalDocument.update({
          where: { id: first.document.id },
          data: { grossTotal: new Prisma.Decimal("999.0000") },
        });
      });
    } catch {
      bodyRejected = true;
    }
    const firstLines = await docs.findById(tenantA, first.document.id);
    const lineId = firstLines?.lines[0]?.id;
    if (lineId) {
      try {
        await withTenantTransaction(tenantA, async (tx) => {
          await tx.fiscalDocumentLine.update({
            where: { id: lineId },
            data: { netAmount: new Prisma.Decimal("999.0000") },
          });
        });
      } catch {
        lineRejected = true;
      }
      try {
        await withTenantTransaction(tenantA, async (tx) => {
          await tx.fiscalDocumentLine.delete({ where: { id: lineId } });
        });
      } catch {
        lineDeleteRejected = true;
      }
    }
    (report.results as ResultMap).dbImmutability = {
      bodyUpdateRejected: bodyRejected,
      lineUpdateRejected: lineRejected,
      lineDeleteRejected: lineDeleteRejected,
    };

    // RLS A/B
    const rls = await withTenantTransaction(tenantB, async (tx) => {
      const folios = await tx.folio.findMany({ where: { tenantId: tenantA } });
      const docsA = await tx.fiscalDocument.findMany({
        where: { tenantId: tenantA },
      });
      const series = await tx.fiscalSeries.findMany({
        where: { tenantId: tenantA },
      });
      const profiles = await tx.businessFiscalProfile.findMany({
        where: { tenantId: tenantA },
      });
      const visibleFolios = await tx.folio.findMany();
      const visibleDocs = await tx.fiscalDocument.findMany();
      let crossInsertRejected = false;
      try {
        await tx.folio.create({
          data: {
            id: randomUUID(),
            tenantId: tenantA,
            bookingId: bookingA,
            folioKey: "hack",
            currency: "EUR",
            status: "open",
          },
        });
      } catch {
        crossInsertRejected = true;
      }
      return {
        cannotSeeAFolios: folios.length === 0,
        cannotSeeADocs: docsA.length === 0,
        cannotSeeASeries: series.length === 0,
        cannotSeeAProfiles: profiles.length === 0,
        visibleFoliosAsB: visibleFolios.length,
        visibleDocsAsB: visibleDocs.length,
        crossInsertRejected,
      };
    });

    const missingCtx = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', '', true)`;
      const folios = await tx.folio.findMany();
      return { visibleWithoutTenant: folios.length };
    });

    // Pooling: tenant A then tenant B on sequential transactions must not leak
    const leakCheck = await (async () => {
      await withTenantTransaction(tenantA, async (tx) => {
        const n = await tx.folio.count();
        if (n < 1) throw new Error("tenant A expected folio");
      });
      return withTenantTransaction(tenantB, async (tx) => {
        const aFolios = await tx.folio.findMany({ where: { tenantId: tenantA } });
        const bProps = await tx.property.findMany();
        return {
          aInvisible: aFolios.length === 0,
          bSeesOwnProperty: bProps.some((p) => p.id === propertyB),
        };
      });
    })();

    (report.results as ResultMap).rls = {
      ...rls,
      missingTenantFailsClosed: missingCtx.visibleWithoutTenant === 0,
      poolingNoLeak: leakCheck.aInvisible && leakCheck.bSeesOwnProperty,
      isolationProven:
        rls.cannotSeeAFolios &&
        rls.cannotSeeADocs &&
        rls.cannotSeeASeries &&
        rls.cannotSeeAProfiles &&
        rls.crossInsertRejected &&
        missingCtx.visibleWithoutTenant === 0 &&
        leakCheck.aInvisible,
    };

    const alloc = report.results.allocationConcurrency as ResultMap;
    const credit = report.results.creditConcurrency as ResultMap;
    const rlsR = report.results.rls as ResultMap;
    const numbering = report.results.atomicNumbering as ResultMap;
    const same = report.results.concurrencySameIdempotency as ResultMap;
    const imm = report.results.dbImmutability as ResultMap;
    const rb = report.results.rollback as ResultMap;

    report.status =
      numbering.sequential &&
      same.exactlyOne &&
      alloc.withinCap &&
      !alloc.overAllocationPossible &&
      credit.withinCap &&
      rlsR.isolationProven &&
      imm.bodyUpdateRejected &&
      imm.lineUpdateRejected &&
      imm.lineDeleteRejected &&
      rb.nextSequenceUnchanged
        ? "PASS"
        : "FAILED";

    if (alloc.overAllocationPossible) {
      (report.issues as string[]).push("Allocation over-cap still possible");
    }
    if (!rlsR.isolationProven) {
      (report.issues as string[]).push("RLS isolation not proven on runtime role");
    }
    if (!credit.withinCap) {
      (report.issues as string[]).push("Credit over-cap still possible");
    }
  } catch (error) {
    report.status = "FAILED";
    (report.issues as string[]).push(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    try {
      await cleanup();
    } catch (e) {
      report.cleanup = {
        status: "LEFT_ISOLATED",
        error: e instanceof Error ? e.message : String(e),
        createdIds: report.createdIds,
        documentIds: createdDocIds,
      };
    }
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
