import type {
  CreateReservationImportBatchInput,
  CreateReservationImportRejectedRowInput,
  CreateReservationImportRowInput,
  IReservationImportRepository,
  ReservationImportBatchRecord,
  ReservationImportRejectedRowRecord,
  ReservationImportRowRecord,
  UpdateReservationImportBatchInput,
  UpdateReservationImportRowInput,
  DurableImportIdentityLookup,
} from "@hcp/domain";
import {
  CSV_RESERVATION_IMPORT_NAMESPACE,
  computeReservationImportDraftExpiresAt,
  DURABLE_IMPORT_ROW_STATUSES,
  importRowsOverlap,
  ValidationError,
} from "@hcp/domain";
import type {
  ReservationImportBatch as PrismaBatch,
  ReservationImportRejectedRow as PrismaRejectedRow,
  ReservationImportRow as PrismaRow,
  Prisma,
} from "@prisma/client";
import { prisma, withTenantTransaction } from "../../client";
import { formatDateColumn, toDateColumn } from "./commerceMappers";

function batchToRecord(record: PrismaBatch): ReservationImportBatchRecord {
  return {
    id: record.id,
    tenantId: record.tenantId,
    propertyId: record.propertyId,
    actorId: record.actorId,
    sourceNamespace: record.sourceNamespace,
    filename: record.filename,
    byteSize: record.byteSize,
    rowCount: record.rowCount,
    status: record.status,
    missingPriceStrategy: record.missingPriceStrategy,
    expiresAt: record.expiresAt,
    committedAt: record.committedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseReplaceBookingIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function rowToRecord(record: PrismaRow): ReservationImportRowRecord {
  return {
    id: record.id,
    tenantId: record.tenantId,
    batchId: record.batchId,
    rowNumber: record.rowNumber,
    sourceNamespace: record.sourceNamespace,
    externalReference: record.externalReference,
    unitId: record.unitId,
    checkIn: formatDateColumn(record.checkIn),
    checkOut: formatDateColumn(record.checkOut),
    temporalClass: record.temporalClass,
    guestName: record.guestName,
    guestEmail: record.guestEmail,
    guestPhone: record.guestPhone,
    guestCount: record.guestCount,
    priceSource: record.priceSource,
    importedTotalAmount: record.importedTotalAmount?.toString() ?? null,
    importedCurrency: record.importedCurrency,
    operatorTotalAmount: record.operatorTotalAmount?.toString() ?? null,
    operatorCurrency: record.operatorCurrency,
    conflictResolution: record.conflictResolution,
    replaceBookingId: record.replaceBookingId,
    replaceBookingIds: parseReplaceBookingIds(record.replaceBookingIds),
    conflictSnapshot: (record.conflictSnapshot ?? {}) as Record<string, unknown>,
    conflictGroupId: record.conflictGroupId,
    recheckRequired: record.recheckRequired,
    status: record.status,
    createdBookingId: record.createdBookingId,
    supersededBookingId: record.supersededBookingId,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    payload: (record.payload ?? {}) as Record<string, unknown>,
    processedAt: record.processedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function rejectedToRecord(record: PrismaRejectedRow): ReservationImportRejectedRowRecord {
  return {
    id: record.id,
    tenantId: record.tenantId,
    batchId: record.batchId,
    rowNumber: record.rowNumber,
    payload: (record.payload ?? {}) as Record<string, unknown>,
    errors: Array.isArray(record.errors) ? (record.errors as unknown[]) : [],
    warnings: Array.isArray(record.warnings) ? (record.warnings as unknown[]) : [],
    createdAt: record.createdAt,
  };
}

export class PrismaReservationImportRepository implements IReservationImportRepository {
  async createBatch(
    input: CreateReservationImportBatchInput,
  ): Promise<ReservationImportBatchRecord> {
    const now = input.now ?? new Date();
    const expiresAt = computeReservationImportDraftExpiresAt(now);
    return withTenantTransaction(input.tenantId, async (tx) => {
      const created = await tx.reservationImportBatch.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          actorId: input.actorId,
          sourceNamespace: input.sourceNamespace ?? CSV_RESERVATION_IMPORT_NAMESPACE,
          filename: input.filename,
          byteSize: input.byteSize ?? null,
          rowCount: input.rowCount ?? 0,
          status: "draft",
          missingPriceStrategy: input.missingPriceStrategy ?? "undecided",
          expiresAt,
          createdAt: now,
          updatedAt: now,
        },
      });
      return batchToRecord(created);
    });
  }

  async findBatchById(
    batchId: string,
    tenantId: string,
  ): Promise<ReservationImportBatchRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.reservationImportBatch.findFirst({
        where: { id: batchId, tenantId },
      });
      return record ? batchToRecord(record) : null;
    });
  }

  async listResumableDrafts(
    tenantId: string,
    now: Date = new Date(),
    propertyId?: string,
  ): Promise<ReservationImportBatchRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.reservationImportBatch.findMany({
        where: {
          tenantId,
          status: "draft",
          expiresAt: { gt: now },
          ...(propertyId ? { propertyId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      return records.map(batchToRecord);
    });
  }

  async updateBatch(
    batchId: string,
    tenantId: string,
    patch: UpdateReservationImportBatchInput,
    now: Date = new Date(),
  ): Promise<ReservationImportBatchRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const existing = await tx.reservationImportBatch.findFirst({
        where: { id: batchId, tenantId },
      });
      if (!existing) {
        throw new ValidationError("Import batch not found");
      }
      if (existing.status === "draft" && existing.expiresAt.getTime() <= now.getTime()) {
        throw new ValidationError("Import draft has expired");
      }
      const updated = await tx.reservationImportBatch.update({
        where: { id: batchId },
        data: {
          ...(patch.missingPriceStrategy !== undefined
            ? { missingPriceStrategy: patch.missingPriceStrategy }
            : {}),
          ...(patch.rowCount !== undefined ? { rowCount: patch.rowCount } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.committedAt !== undefined ? { committedAt: patch.committedAt } : {}),
        },
      });
      return batchToRecord(updated);
    });
  }

  async cancelDraft(
    batchId: string,
    tenantId: string,
    now: Date = new Date(),
  ): Promise<ReservationImportBatchRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const existing = await tx.reservationImportBatch.findFirst({
        where: { id: batchId, tenantId },
      });
      if (!existing) {
        throw new ValidationError("Import batch not found");
      }
      if (existing.status === "cancelled" || existing.status === "expired") {
        return batchToRecord(existing);
      }
      if (existing.status !== "draft") {
        throw new ValidationError("Only draft import batches can be cancelled");
      }

      // Discard non-durable workflow rows; never touch durable import identity rows.
      await tx.reservationImportRow.deleteMany({
        where: {
          tenantId,
          batchId,
          status: { notIn: [...DURABLE_IMPORT_ROW_STATUSES] },
        },
      });
      await tx.reservationImportRejectedRow.deleteMany({
        where: { tenantId, batchId },
      });

      const updated = await tx.reservationImportBatch.update({
        where: { id: batchId },
        data: {
          status: "cancelled",
          updatedAt: now,
        },
      });
      return batchToRecord(updated);
    });
  }

  async createRows(
    inputs: CreateReservationImportRowInput[],
  ): Promise<ReservationImportRowRecord[]> {
    if (inputs.length === 0) return [];
    const tenantId = inputs[0]!.tenantId;
    return withTenantTransaction(tenantId, async (tx) => {
      const data: Prisma.ReservationImportRowCreateManyInput[] = inputs.map((input) => ({
        id: input.id,
        tenantId: input.tenantId,
        batchId: input.batchId,
        rowNumber: input.rowNumber,
        sourceNamespace: input.sourceNamespace ?? CSV_RESERVATION_IMPORT_NAMESPACE,
        externalReference: input.externalReference.trim(),
        unitId: input.unitId,
        checkIn: toDateColumn(input.checkIn),
        checkOut: toDateColumn(input.checkOut),
        temporalClass: input.temporalClass,
        guestName: input.guestName,
        guestEmail: input.guestEmail ?? null,
        guestPhone: input.guestPhone ?? null,
        guestCount: input.guestCount,
        priceSource: input.priceSource ?? "unresolved",
        importedTotalAmount: input.importedTotalAmount ?? null,
        importedCurrency: input.importedCurrency ?? null,
        operatorTotalAmount: input.operatorTotalAmount ?? null,
        operatorCurrency: input.operatorCurrency ?? null,
        conflictResolution: input.conflictResolution ?? "undecided",
        replaceBookingId: input.replaceBookingId ?? null,
        replaceBookingIds: (input.replaceBookingIds ?? []) as Prisma.InputJsonValue,
        conflictSnapshot: (input.conflictSnapshot ?? {}) as Prisma.InputJsonValue,
        conflictGroupId: input.conflictGroupId ?? null,
        recheckRequired: input.recheckRequired ?? false,
        status: input.status ?? "pending",
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      }));

      await tx.reservationImportRow.createMany({ data });
      const rows = await tx.reservationImportRow.findMany({
        where: {
          tenantId,
          id: { in: inputs.map((i) => i.id) },
        },
        orderBy: { rowNumber: "asc" },
      });
      return rows.map(rowToRecord);
    });
  }

  async listRowsForBatch(
    batchId: string,
    tenantId: string,
  ): Promise<ReservationImportRowRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.reservationImportRow.findMany({
        where: { tenantId, batchId },
        orderBy: { rowNumber: "asc" },
      });
      return rows.map(rowToRecord);
    });
  }

  async updateRow(
    rowId: string,
    tenantId: string,
    patch: UpdateReservationImportRowInput,
    now: Date = new Date(),
  ): Promise<ReservationImportRowRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const existing = await tx.reservationImportRow.findFirst({
        where: { id: rowId, tenantId },
      });
      if (!existing) {
        throw new ValidationError("Import row not found");
      }

      const batch = await tx.reservationImportBatch.findFirst({
        where: { id: existing.batchId, tenantId },
      });
      if (batch?.status === "draft" && batch.expiresAt.getTime() <= now.getTime()) {
        throw new ValidationError("Import draft has expired");
      }

      const updated = await tx.reservationImportRow.update({
        where: { id: rowId },
        data: {
          ...(patch.priceSource !== undefined ? { priceSource: patch.priceSource } : {}),
          ...(patch.importedTotalAmount !== undefined
            ? { importedTotalAmount: patch.importedTotalAmount }
            : {}),
          ...(patch.importedCurrency !== undefined
            ? { importedCurrency: patch.importedCurrency }
            : {}),
          ...(patch.operatorTotalAmount !== undefined
            ? { operatorTotalAmount: patch.operatorTotalAmount }
            : {}),
          ...(patch.operatorCurrency !== undefined
            ? { operatorCurrency: patch.operatorCurrency }
            : {}),
          ...(patch.conflictResolution !== undefined
            ? { conflictResolution: patch.conflictResolution }
            : {}),
          ...(patch.replaceBookingId !== undefined
            ? { replaceBookingId: patch.replaceBookingId }
            : {}),
          ...(patch.replaceBookingIds !== undefined
            ? { replaceBookingIds: patch.replaceBookingIds as Prisma.InputJsonValue }
            : {}),
          ...(patch.conflictSnapshot !== undefined
            ? { conflictSnapshot: patch.conflictSnapshot as Prisma.InputJsonValue }
            : {}),
          ...(patch.conflictGroupId !== undefined
            ? { conflictGroupId: patch.conflictGroupId }
            : {}),
          ...(patch.recheckRequired !== undefined
            ? { recheckRequired: patch.recheckRequired }
            : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.createdBookingId !== undefined
            ? { createdBookingId: patch.createdBookingId }
            : {}),
          ...(patch.supersededBookingId !== undefined
            ? { supersededBookingId: patch.supersededBookingId }
            : {}),
          ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
          ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
          ...(patch.payload !== undefined
            ? { payload: patch.payload as Prisma.InputJsonValue }
            : {}),
          ...(patch.processedAt !== undefined ? { processedAt: patch.processedAt } : {}),
        },
      });
      return rowToRecord(updated);
    });
  }

  async findDurableByExternalReference(
    lookup: DurableImportIdentityLookup,
  ): Promise<ReservationImportRowRecord | null> {
    return withTenantTransaction(lookup.tenantId, async (tx) => {
      const record = await tx.reservationImportRow.findFirst({
        where: {
          tenantId: lookup.tenantId,
          sourceNamespace: lookup.sourceNamespace,
          externalReference: lookup.externalReference,
          status: { in: [...DURABLE_IMPORT_ROW_STATUSES] },
        },
      });
      return record ? rowToRecord(record) : null;
    });
  }

  async createRejectedRows(
    inputs: CreateReservationImportRejectedRowInput[],
  ): Promise<ReservationImportRejectedRowRecord[]> {
    if (inputs.length === 0) return [];
    const tenantId = inputs[0]!.tenantId;
    return withTenantTransaction(tenantId, async (tx) => {
      await tx.reservationImportRejectedRow.createMany({
        data: inputs.map((input) => ({
          id: input.id,
          tenantId: input.tenantId,
          batchId: input.batchId,
          rowNumber: input.rowNumber,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          errors: (input.errors ?? []) as Prisma.InputJsonValue,
          warnings: (input.warnings ?? []) as Prisma.InputJsonValue,
        })),
      });
      const rows = await tx.reservationImportRejectedRow.findMany({
        where: {
          tenantId,
          id: { in: inputs.map((i) => i.id) },
        },
        orderBy: { rowNumber: "asc" },
      });
      return rows.map(rejectedToRecord);
    });
  }

  async listRejectedRowsForBatch(
    batchId: string,
    tenantId: string,
  ): Promise<ReservationImportRejectedRowRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.reservationImportRejectedRow.findMany({
        where: { tenantId, batchId },
        orderBy: { rowNumber: "asc" },
      });
      return rows.map(rejectedToRecord);
    });
  }

  async applyConflictDecisionAtomic(input: {
    tenantId: string;
    batchId: string;
    rowId: string;
    conflictResolution: import("@hcp/domain").ReservationImportConflictResolution;
    replaceBookingIds: string[];
    replaceBookingId: string | null;
    priceSource?: import("@hcp/domain").ReservationImportPriceSource;
    operatorTotalAmount?: string | null;
    operatorCurrency?: string | null;
    now?: Date;
  }): Promise<ReservationImportRowRecord[]> {
    const now = input.now ?? new Date();
    return withTenantTransaction(input.tenantId, async (tx) => {
      const batch = await tx.reservationImportBatch.findFirst({
        where: { id: input.batchId, tenantId: input.tenantId },
      });
      if (!batch) {
        throw new ValidationError("Import draft not found");
      }
      if (batch.status === "draft" && batch.expiresAt.getTime() <= now.getTime()) {
        throw new ValidationError("Import draft has expired");
      }

      const target = await tx.reservationImportRow.findFirst({
        where: {
          id: input.rowId,
          tenantId: input.tenantId,
          batchId: input.batchId,
        },
      });
      if (!target) {
        throw new ValidationError("Import row not found");
      }

      // Lock all import rows for this unit in the batch (exclusivity concurrency).
      await tx.$queryRaw`
        SELECT id FROM reservation_import_rows
        WHERE tenant_id = ${input.tenantId}::uuid
          AND batch_id = ${input.batchId}::uuid
          AND unit_id = ${target.unitId}::uuid
        FOR UPDATE
      `;

      const unitRows = await tx.reservationImportRow.findMany({
        where: {
          tenantId: input.tenantId,
          batchId: input.batchId,
          unitId: target.unitId,
        },
      });

      const primary = rowToRecord(target);
      const peers = unitRows.map(rowToRecord);

      await tx.reservationImportRow.update({
        where: { id: input.rowId },
        data: {
          conflictResolution: input.conflictResolution,
          replaceBookingIds: input.replaceBookingIds as Prisma.InputJsonValue,
          replaceBookingId: input.replaceBookingId,
          ...(input.priceSource !== undefined ? { priceSource: input.priceSource } : {}),
          ...(input.operatorTotalAmount !== undefined
            ? { operatorTotalAmount: input.operatorTotalAmount }
            : {}),
          ...(input.operatorCurrency !== undefined
            ? { operatorCurrency: input.operatorCurrency }
            : {}),
          updatedAt: now,
        },
      });

      if (input.conflictResolution === "keep_csv") {
        for (const peer of peers) {
          if (peer.id === input.rowId) continue;
          if (peer.conflictResolution !== "keep_csv") continue;
          if (!importRowsOverlap(primary, peer)) continue;
          await tx.reservationImportRow.update({
            where: { id: peer.id },
            data: {
              conflictResolution: "keep_existing",
              replaceBookingIds: [] as unknown as Prisma.InputJsonValue,
              replaceBookingId: null,
              updatedAt: now,
            },
          });
        }
      }

      const all = await tx.reservationImportRow.findMany({
        where: { tenantId: input.tenantId, batchId: input.batchId },
        orderBy: { rowNumber: "asc" },
      });
      const records = all.map(rowToRecord);
      const dual = records.filter((r) => r.conflictResolution === "keep_csv");
      for (let i = 0; i < dual.length; i++) {
        for (let j = i + 1; j < dual.length; j++) {
          if (importRowsOverlap(dual[i]!, dual[j]!)) {
            throw new ValidationError(
              "Overlapping CSV rows cannot both keep_csv for the same unit",
            );
          }
        }
      }
      return records;
    });
  }

  async expireDrafts(
    now: Date = new Date(),
    limit = 100,
  ): Promise<{ expiredBatches: number; discardedRows: number }> {
    // Cross-tenant sweep — same pattern as ExpireHolds (worker DB URL typically BYPASSRLS).
    const expired = await prisma.reservationImportBatch.findMany({
      where: {
        status: "draft",
        expiresAt: { lte: now },
      },
      select: { id: true, tenantId: true },
      take: limit,
      orderBy: { expiresAt: "asc" },
    });

    let expiredBatches = 0;
    let discardedRows = 0;

    for (const batch of expired) {
      await withTenantTransaction(batch.tenantId, async (tx) => {
        const deleted = await tx.reservationImportRow.deleteMany({
          where: {
            tenantId: batch.tenantId,
            batchId: batch.id,
            status: { notIn: [...DURABLE_IMPORT_ROW_STATUSES] },
          },
        });
        const deletedRejected = await tx.reservationImportRejectedRow.deleteMany({
          where: {
            tenantId: batch.tenantId,
            batchId: batch.id,
          },
        });
        discardedRows += deleted.count + deletedRejected.count;

        const updated = await tx.reservationImportBatch.updateMany({
          where: {
            id: batch.id,
            tenantId: batch.tenantId,
            status: "draft",
          },
          data: {
            status: "expired",
            updatedAt: now,
          },
        });
        expiredBatches += updated.count;
      });
    }

    return { expiredBatches, discardedRows };
  }

  async lockDraftForCommit(
    batchId: string,
    tenantId: string,
  ): Promise<{
    batch: ReservationImportBatchRecord | null;
    rows: ReservationImportRowRecord[];
  }> {
    return withTenantTransaction(tenantId, async (tx) => {
      const lockedBatches = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM reservation_import_batches
        WHERE id = ${batchId}::uuid
          AND tenant_id = ${tenantId}::uuid
        FOR UPDATE
      `;
      if (lockedBatches.length === 0) {
        return { batch: null, rows: [] };
      }

      await tx.$queryRaw`
        SELECT id FROM reservation_import_rows
        WHERE tenant_id = ${tenantId}::uuid
          AND batch_id = ${batchId}::uuid
        ORDER BY row_number ASC
        FOR UPDATE
      `;

      const batch = await tx.reservationImportBatch.findFirst({
        where: { id: batchId, tenantId },
      });
      const rows = await tx.reservationImportRow.findMany({
        where: { tenantId, batchId },
        orderBy: { rowNumber: "asc" },
      });
      return {
        batch: batch ? batchToRecord(batch) : null,
        rows: rows.map(rowToRecord),
      };
    });
  }
}
