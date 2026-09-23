import { Prisma } from "@prisma/client";
import { prisma, setTenantContext } from "../../client";
import {
  FiscalSeries,
  FiscalDocument,
  FiscalDocumentLine,
  FiscalLineAllocation,
  type FiscalDocumentKind,
  type FiscalDocumentStatus,
  type FiscalIssuerSnapshot,
  type FiscalCustomerSnapshot,
  type FiscalDocumentWithLines,
  type IssueFiscalDocumentCommand,
  type IssueFiscalDocumentResult,
  type IFiscalSeriesRepository,
  type IFiscalDocumentRepository,
  type IFiscalAllocationRepository,
  type FolioLineTaxSnapshot,
} from "@hcp/domain";
import { PrismaOutboxRepository } from "../OutboxRepository";

type SeriesRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  documentKind: string;
  seriesCode: string;
  nextSequence: number;
  active: boolean;
  label: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

function mapSeries(row: SeriesRow): FiscalSeries {
  return FiscalSeries.rehydrate({
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    documentKind: row.documentKind as FiscalDocumentKind,
    seriesCode: row.seriesCode,
    nextSequence: row.nextSequence,
    active: row.active,
    label: row.label,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function mapDocument(
  row: {
    id: string;
    tenantId: string;
    propertyId: string;
    documentKind: string;
    status: string;
    seriesId: string | null;
    seriesCode: string | null;
    sequenceNumber: number | null;
    issuanceIdempotencyKey: string | null;
    issuedAt: Date | null;
    currency: string;
    issuerSnapshot: Prisma.JsonValue;
    customerSnapshot: Prisma.JsonValue | null;
    netTotal: Prisma.Decimal;
    vatTotal: Prisma.Decimal;
    otherTaxTotal: Prisma.Decimal;
    levyTotal: Prisma.Decimal;
    grossTotal: Prisma.Decimal;
    roundingPolicy: string;
    paymentMethodSummary: string | null;
    sourceBookingId: string | null;
    originalDocumentId: string | null;
    creditReason: string | null;
    creditedScope: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  },
  lines: FiscalDocumentLine[] = [],
): FiscalDocumentWithLines {
  return FiscalDocument.rehydrate(
    {
      id: row.id,
      tenantId: row.tenantId,
      propertyId: row.propertyId,
      documentKind: row.documentKind as FiscalDocumentKind,
      status: row.status as FiscalDocumentStatus,
      seriesId: row.seriesId,
      seriesCode: row.seriesCode,
      sequenceNumber: row.sequenceNumber,
      issuanceIdempotencyKey: row.issuanceIdempotencyKey,
      issuedAt: row.issuedAt,
      currency: row.currency,
      issuerSnapshot: row.issuerSnapshot as unknown as FiscalIssuerSnapshot,
      customerSnapshot: row.customerSnapshot
        ? (row.customerSnapshot as unknown as FiscalCustomerSnapshot)
        : null,
      totals: {
        currency: row.currency,
        netTotal: row.netTotal.toFixed(4),
        vatTotal: row.vatTotal.toFixed(4),
        otherTaxTotal: row.otherTaxTotal.toFixed(4),
        levyTotal: row.levyTotal.toFixed(4),
        grossTotal: row.grossTotal.toFixed(4),
      },
      roundingPolicy: row.roundingPolicy as "deterministic_money_4dp",
      paymentMethodSummary: row.paymentMethodSummary,
      sourceBookingId: row.sourceBookingId,
      correlation:
        row.originalDocumentId && row.creditReason && row.creditedScope
          ? {
              originalDocumentId: row.originalDocumentId,
              reason: row.creditReason,
              creditedScope: row.creditedScope as "full" | "partial",
            }
          : null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    lines,
  );
}

function mapLine(row: {
  id: string;
  tenantId: string;
  fiscalDocumentId: string;
  sortOrder: number;
  description: string;
  quantity: Prisma.Decimal;
  unit: string | null;
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  levyAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  currency: string;
  classificationKey: string | null;
  taxSnapshot: Prisma.JsonValue | null;
  sourceFolioId: string | null;
  sourceFolioLineId: string | null;
  dailyUseProvenance: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue;
}): FiscalDocumentLine {
  return FiscalDocumentLine.rehydrate({
    id: row.id,
    tenantId: row.tenantId,
    fiscalDocumentId: row.fiscalDocumentId,
    sortOrder: row.sortOrder,
    description: row.description,
    quantity: row.quantity.toFixed(4),
    unit: row.unit,
    netAmount: row.netAmount.toFixed(4),
    vatAmount: row.vatAmount.toFixed(4),
    levyAmount: row.levyAmount.toFixed(4),
    grossAmount: row.grossAmount.toFixed(4),
    currency: row.currency,
    classificationKey: row.classificationKey,
    taxSnapshot: (row.taxSnapshot as FolioLineTaxSnapshot | null) ?? null,
    sourceFolioId: row.sourceFolioId,
    sourceFolioLineId: row.sourceFolioLineId,
    dailyUseProvenance: row.dailyUseProvenance
      ? (row.dailyUseProvenance as Record<string, unknown>)
      : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  });
}

function documentCreateData(doc: FiscalDocument, statusOverride?: string) {
  const p = doc.toProps();
  return {
    id: p.id,
    tenantId: p.tenantId,
    propertyId: p.propertyId,
    documentKind: p.documentKind,
    status: statusOverride ?? p.status,
    seriesId: p.seriesId,
    seriesCode: p.seriesCode,
    sequenceNumber: p.sequenceNumber,
    issuanceIdempotencyKey: p.issuanceIdempotencyKey,
    issuedAt: p.issuedAt,
    currency: p.currency,
    issuerSnapshot: p.issuerSnapshot as unknown as Prisma.InputJsonValue,
    customerSnapshot: p.customerSnapshot
      ? (p.customerSnapshot as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    netTotal: new Prisma.Decimal(p.totals.netTotal),
    vatTotal: new Prisma.Decimal(p.totals.vatTotal),
    otherTaxTotal: new Prisma.Decimal(p.totals.otherTaxTotal),
    levyTotal: new Prisma.Decimal(p.totals.levyTotal),
    grossTotal: new Prisma.Decimal(p.totals.grossTotal),
    roundingPolicy: p.roundingPolicy,
    paymentMethodSummary: p.paymentMethodSummary,
    sourceBookingId: p.sourceBookingId,
    originalDocumentId: p.correlation?.originalDocumentId ?? null,
    creditReason: p.correlation?.reason ?? null,
    creditedScope: p.correlation?.creditedScope ?? null,
    metadata: p.metadata as Prisma.InputJsonValue,
  };
}

function lineCreateData(line: FiscalDocumentLine) {
  const p = line.toProps();
  return {
    id: p.id,
    tenantId: p.tenantId,
    fiscalDocumentId: p.fiscalDocumentId,
    sortOrder: p.sortOrder,
    description: p.description,
    quantity: new Prisma.Decimal(p.quantity),
    unit: p.unit,
    netAmount: new Prisma.Decimal(p.netAmount),
    vatAmount: new Prisma.Decimal(p.vatAmount),
    levyAmount: new Prisma.Decimal(p.levyAmount),
    grossAmount: new Prisma.Decimal(p.grossAmount),
    currency: p.currency,
    classificationKey: p.classificationKey,
    taxSnapshot: p.taxSnapshot
      ? (p.taxSnapshot as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    sourceFolioId: p.sourceFolioId,
    sourceFolioLineId: p.sourceFolioLineId,
    dailyUseProvenance: p.dailyUseProvenance
      ? (p.dailyUseProvenance as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    metadata: p.metadata as Prisma.InputJsonValue,
  };
}

export class PrismaFiscalSeriesRepository implements IFiscalSeriesRepository {
  async save(series: FiscalSeries): Promise<void> {
    const p = series.toProps();
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, p.tenantId);
      await tx.fiscalSeries.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          tenantId: p.tenantId,
          propertyId: p.propertyId,
          documentKind: p.documentKind,
          seriesCode: p.seriesCode,
          nextSequence: p.nextSequence,
          active: p.active,
          label: p.label,
          metadata: p.metadata as Prisma.InputJsonValue,
        },
        update: {
          active: p.active,
          label: p.label,
          metadata: p.metadata as Prisma.InputJsonValue,
          // nextSequence is NEVER updated from app save — only via issueAtomic UPDATE RETURNING
        },
      });
    });
  }

  async findById(tenantId: string, id: string): Promise<FiscalSeries | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.fiscalSeries.findFirst({ where: { id, tenantId } });
    return row ? mapSeries(row) : null;
  }

  async findActive(
    tenantId: string,
    propertyId: string,
    documentKind: FiscalDocumentKind,
  ): Promise<FiscalSeries[]> {
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.fiscalSeries.findMany({
      where: { tenantId, propertyId, documentKind, active: true },
      orderBy: { seriesCode: "asc" },
    });
    return rows.map(mapSeries);
  }

  async listByTenant(tenantId: string): Promise<FiscalSeries[]> {
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.fiscalSeries.findMany({
      where: { tenantId },
      orderBy: [{ propertyId: "asc" }, { documentKind: "asc" }, { seriesCode: "asc" }],
    });
    return rows.map(mapSeries);
  }
}

export class PrismaFiscalDocumentRepository implements IFiscalDocumentRepository {
  private readonly outbox = new PrismaOutboxRepository();

  async saveDraft(
    document: FiscalDocument,
    lines: FiscalDocumentLine[],
  ): Promise<void> {
    const p = document.toProps();
    if (p.status !== "DRAFT") {
      throw new Error("saveDraft only accepts DRAFT documents");
    }
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, p.tenantId);
      await tx.fiscalDocument.upsert({
        where: { id: p.id },
        create: documentCreateData(document),
        update: {
          documentKind: p.documentKind,
          seriesId: p.seriesId,
          seriesCode: p.seriesCode,
          currency: p.currency,
          issuerSnapshot: p.issuerSnapshot as unknown as Prisma.InputJsonValue,
          customerSnapshot: p.customerSnapshot
            ? (p.customerSnapshot as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          netTotal: new Prisma.Decimal(p.totals.netTotal),
          vatTotal: new Prisma.Decimal(p.totals.vatTotal),
          otherTaxTotal: new Prisma.Decimal(p.totals.otherTaxTotal),
          levyTotal: new Prisma.Decimal(p.totals.levyTotal),
          grossTotal: new Prisma.Decimal(p.totals.grossTotal),
          paymentMethodSummary: p.paymentMethodSummary,
          sourceBookingId: p.sourceBookingId,
          originalDocumentId: p.correlation?.originalDocumentId ?? null,
          creditReason: p.correlation?.reason ?? null,
          creditedScope: p.correlation?.creditedScope ?? null,
          metadata: p.metadata as Prisma.InputJsonValue,
        },
      });
      await tx.fiscalDocumentLine.deleteMany({
        where: { tenantId: p.tenantId, fiscalDocumentId: p.id },
      });
      if (lines.length) {
        await tx.fiscalDocumentLine.createMany({
          data: lines.map(lineCreateData),
        });
      }
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<FiscalDocumentWithLines | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.fiscalDocument.findFirst({
      where: { id, tenantId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!row) return null;
    return mapDocument(row, row.lines.map(mapLine));
  }

  async findByIssuanceIdempotencyKey(
    tenantId: string,
    key: string,
  ): Promise<FiscalDocumentWithLines | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.fiscalDocument.findFirst({
      where: { tenantId, issuanceIdempotencyKey: key },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!row) return null;
    return mapDocument(row, row.lines.map(mapLine));
  }

  async listByTenant(
    tenantId: string,
    opts?: { propertyId?: string; limit?: number },
  ): Promise<FiscalDocument[]> {
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.fiscalDocument.findMany({
      where: {
        tenantId,
        ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
      },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take: opts?.limit ?? 100,
    });
    return rows.map((r) => mapDocument(r).document);
  }

  async listCreditsAgainst(
    tenantId: string,
    originalDocumentId: string,
  ): Promise<FiscalDocument[]> {
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.fiscalDocument.findMany({
      where: { tenantId, originalDocumentId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => mapDocument(r).document);
  }

  async issueAtomic(
    command: IssueFiscalDocumentCommand,
  ): Promise<IssueFiscalDocumentResult> {
    const key = command.issuanceIdempotencyKey.trim();
    const tenantId = command.document.tenantId;
    const seriesId = command.document.seriesId;
    if (!seriesId) {
      throw new Error("seriesId required for issuance");
    }

    try {
      return await prisma.$transaction(async (tx) => {
        await setTenantContext(tx, tenantId);

        // Idempotent retry: return existing ISSUED doc for this key.
        const existing = await tx.fiscalDocument.findFirst({
          where: { tenantId, issuanceIdempotencyKey: key },
          include: { lines: { orderBy: { sortOrder: "asc" } } },
        });
        if (existing) {
          const mapped = mapDocument(existing, existing.lines.map(mapLine));
          return {
            document: mapped.document,
            lines: mapped.lines,
            alreadyIssued: true,
          };
        }

        // Lock series row and allocate next sequence (rolls back with TX on failure).
        const locked = await tx.$queryRaw<
          Array<{ id: string; next_sequence: number; active: boolean; document_kind: string }>
        >`
          SELECT id, next_sequence, active, document_kind
          FROM fiscal_series
          WHERE id = ${seriesId}::uuid AND tenant_id = ${tenantId}::uuid
          FOR UPDATE
        `;
        const seriesRow = locked[0];
        if (!seriesRow) {
          throw new Error("FiscalSeries not found");
        }
        if (!seriesRow.active) {
          throw new Error("FiscalSeries is inactive");
        }
        const sequenceNumber = seriesRow.next_sequence;
        await tx.$executeRaw`
          UPDATE fiscal_series
          SET next_sequence = next_sequence + 1, updated_at = NOW()
          WHERE id = ${seriesId}::uuid AND tenant_id = ${tenantId}::uuid
        `;

        // Domain transition (in-memory)
        command.document.markIssued({
          sequenceNumber,
          issuanceIdempotencyKey: key,
          lines: command.lines,
        });
        const issuedProps = command.document.toProps();

        const draftRow = await tx.fiscalDocument.findFirst({
          where: { id: command.document.id, tenantId },
        });
        if (!draftRow) {
          await tx.fiscalDocument.create({
            data: documentCreateData(command.document),
          });
          await tx.fiscalDocumentLine.createMany({
            data: command.lines.map(lineCreateData),
          });
        } else if (draftRow.status !== "DRAFT") {
          throw new Error("Document is not in DRAFT status");
        } else {
          // Promote DRAFT → ISSUED without rewriting line financial body.
          await tx.fiscalDocument.update({
            where: { id: command.document.id },
            data: {
              status: "ISSUED",
              sequenceNumber: issuedProps.sequenceNumber,
              issuanceIdempotencyKey: issuedProps.issuanceIdempotencyKey,
              issuedAt: issuedProps.issuedAt,
              updatedAt: new Date(),
            },
          });
        }

        if (command.allocations.length) {
          await tx.fiscalLineAllocation.createMany({
            data: command.allocations.map((a) => {
              const p = a.toProps();
              return {
                id: p.id,
                tenantId: p.tenantId,
                folioId: p.folioId,
                folioLineId: p.folioLineId,
                fiscalDocumentId: p.fiscalDocumentId,
                fiscalDocumentLineId: p.fiscalDocumentLineId,
                allocatedAmount: new Prisma.Decimal(p.allocatedAmount),
                currency: p.currency,
                createdAt: p.createdAt,
              };
            }),
          });
        }

        const events = command.document.pullDomainEvents();
        await this.outbox.saveEvents(events, tx);
        await tx.auditLog.create({
          data: {
            tenantId: command.auditEntry.tenantId,
            actorId: command.auditEntry.actorId,
            action: command.auditEntry.action,
            resourceType: command.auditEntry.resourceType,
            resourceId: command.auditEntry.resourceId,
            metadata: command.auditEntry.metadata as Prisma.InputJsonValue,
            ipAddress: command.auditEntry.ipAddress,
          },
        });

        const issued = await tx.fiscalDocument.findFirstOrThrow({
          where: { id: command.document.id, tenantId },
          include: { lines: { orderBy: { sortOrder: "asc" } } },
        });
        const mapped = mapDocument(issued, issued.lines.map(mapLine));
        return {
          document: mapped.document,
          lines: mapped.lines,
          alreadyIssued: false,
        };
      });
    } catch (error) {
      // Concurrent idempotent insert race → return winner
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const again = await this.findByIssuanceIdempotencyKey(tenantId, key);
        if (again && again.document.status === "ISSUED") {
          return {
            document: again.document,
            lines: again.lines,
            alreadyIssued: true,
          };
        }
      }
      throw error;
    }
  }
}

export class PrismaFiscalAllocationRepository
  implements IFiscalAllocationRepository
{
  async listByFolioLineIds(
    tenantId: string,
    folioLineIds: string[],
  ): Promise<FiscalLineAllocation[]> {
    if (folioLineIds.length === 0) return [];
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.fiscalLineAllocation.findMany({
      where: { tenantId, folioLineId: { in: folioLineIds } },
    });
    return rows.map((r) =>
      FiscalLineAllocation.rehydrate({
        id: r.id,
        tenantId: r.tenantId,
        folioId: r.folioId,
        folioLineId: r.folioLineId,
        fiscalDocumentId: r.fiscalDocumentId,
        fiscalDocumentLineId: r.fiscalDocumentLineId,
        allocatedAmount: r.allocatedAmount.toFixed(4),
        currency: r.currency,
        createdAt: r.createdAt,
      }),
    );
  }

  async listByFolioId(
    tenantId: string,
    folioId: string,
  ): Promise<FiscalLineAllocation[]> {
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.fiscalLineAllocation.findMany({
      where: { tenantId, folioId },
    });
    return rows.map((r) =>
      FiscalLineAllocation.rehydrate({
        id: r.id,
        tenantId: r.tenantId,
        folioId: r.folioId,
        folioLineId: r.folioLineId,
        fiscalDocumentId: r.fiscalDocumentId,
        fiscalDocumentLineId: r.fiscalDocumentLineId,
        allocatedAmount: r.allocatedAmount.toFixed(4),
        currency: r.currency,
        createdAt: r.createdAt,
      }),
    );
  }

  async sumAllocatedForFolioLine(
    tenantId: string,
    folioLineId: string,
  ): Promise<string> {
    await setTenantContext(prisma, tenantId);
    const agg = await prisma.fiscalLineAllocation.aggregate({
      where: { tenantId, folioLineId },
      _sum: { allocatedAmount: true },
    });
    return agg._sum.allocatedAmount?.toFixed(4) ?? "0.0000";
  }
}
