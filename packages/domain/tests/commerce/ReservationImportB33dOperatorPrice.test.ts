import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  UpdateReservationImportRowDecisionUseCase,
} from "../../src/commerce/import/ReservationImportDraftDecisionUseCases";
import { CreateReservationImportDraftUseCase } from "../../src/commerce/import/CreateReservationImportDraftUseCase";
import {
  normalizeOperatorEnteredImportPrice,
  RESERVATION_IMPORT_MANUAL_PRICE_DEFAULT_CURRENCY,
} from "../../src/commerce/import/ReservationImportOperatorPrice";
import {
  computeReservationImportDraftExpiresAt,
  type ReservationImportBatchRecord,
  type ReservationImportRowRecord,
  type CreateReservationImportBatchInput,
  type CreateReservationImportRowInput,
} from "../../src/commerce/import/ReservationImportTypes";
import type {
  IReservationImportRepository,
  UpdateReservationImportBatchInput,
  UpdateReservationImportRowInput,
} from "../../src/commerce/import/IReservationImportRepository";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";

function makeBatch(
  overrides: Partial<ReservationImportBatchRecord> = {},
): ReservationImportBatchRecord {
  const createdAt = overrides.createdAt ?? new Date("2026-10-03T10:00:00.000Z");
  return {
    id: overrides.id ?? randomUUID(),
    tenantId: overrides.tenantId ?? "tenant-a",
    propertyId: overrides.propertyId ?? "prop-a",
    actorId: overrides.actorId ?? "actor-a",
    sourceNamespace: "csv_reservation_import",
    filename: overrides.filename ?? "t.csv",
    byteSize: 10,
    rowCount: overrides.rowCount ?? 0,
    status: overrides.status ?? "draft",
    missingPriceStrategy: overrides.missingPriceStrategy ?? "undecided",
    expiresAt: overrides.expiresAt ?? computeReservationImportDraftExpiresAt(createdAt),
    committedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function makeRow(
  batchId: string,
  overrides: Partial<ReservationImportRowRecord> = {},
): ReservationImportRowRecord {
  const now = new Date("2026-10-03T10:00:00.000Z");
  return {
    id: overrides.id ?? randomUUID(),
    tenantId: "tenant-a",
    batchId,
    rowNumber: overrides.rowNumber ?? 1,
    sourceNamespace: "csv_reservation_import",
    externalReference: overrides.externalReference ?? "EXT-1",
    unitId: overrides.unitId ?? "unit-a",
    checkIn: overrides.checkIn ?? "2026-12-01",
    checkOut: overrides.checkOut ?? "2026-12-03",
    temporalClass: overrides.temporalClass ?? "future",
    guestName: overrides.guestName ?? "Guest",
    guestEmail: overrides.guestEmail ?? "g@test.com",
    guestPhone: null,
    guestCount: overrides.guestCount ?? 2,
    priceSource: overrides.priceSource ?? "unresolved",
    importedTotalAmount: overrides.importedTotalAmount ?? null,
    importedCurrency: overrides.importedCurrency ?? null,
    operatorTotalAmount: overrides.operatorTotalAmount ?? null,
    operatorCurrency: overrides.operatorCurrency ?? null,
    conflictResolution: overrides.conflictResolution ?? "undecided",
    replaceBookingId: null,
    replaceBookingIds: [],
    conflictSnapshot: overrides.conflictSnapshot ?? {
      version: 1,
      existingBookingIds: [],
      peerImportRowIds: [],
      nonBookingBlockers: [],
      overlaps: [],
    },
    conflictGroupId: null,
    recheckRequired: false,
    status: overrides.status ?? "pending",
    createdBookingId: null,
    supersededBookingId: null,
    errorCode: null,
    errorMessage: null,
    payload: {},
    processedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryImports implements IReservationImportRepository {
  batches = new Map<string, ReservationImportBatchRecord>();
  rows = new Map<string, ReservationImportRowRecord>();
  rejected = new Map<string, never>();

  async createBatch(input: CreateReservationImportBatchInput) {
    const now = input.now ?? new Date();
    const batch = makeBatch({
      id: input.id,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      actorId: input.actorId,
      filename: input.filename,
      createdAt: now,
      missingPriceStrategy: input.missingPriceStrategy ?? "undecided",
    });
    this.batches.set(batch.id, batch);
    return batch;
  }
  async findBatchById(batchId: string, tenantId: string) {
    const b = this.batches.get(batchId);
    return b && b.tenantId === tenantId ? b : null;
  }
  async listResumableDrafts() {
    return [];
  }
  async updateBatch(batchId: string, tenantId: string, patch: UpdateReservationImportBatchInput) {
    const b = (await this.findBatchById(batchId, tenantId))!;
    Object.assign(b, patch, { updatedAt: new Date() });
    return b;
  }
  async createRows(inputs: CreateReservationImportRowInput[]) {
    const out = [];
    for (const input of inputs) {
      const row = makeRow(input.batchId, input as Partial<ReservationImportRowRecord>);
      this.rows.set(row.id, row);
      out.push(row);
    }
    return out;
  }
  async createRejectedRows() {
    return [];
  }
  async listRowsForBatch(batchId: string, tenantId: string) {
    return [...this.rows.values()].filter((r) => r.batchId === batchId && r.tenantId === tenantId);
  }
  async listRejectedRowsForBatch() {
    return [];
  }
  async updateRow(rowId: string, tenantId: string, patch: UpdateReservationImportRowInput) {
    const row = this.rows.get(rowId)!;
    Object.assign(row, patch, { updatedAt: new Date() });
    return row;
  }
  async applyConflictDecisionAtomic(input: {
    tenantId: string;
    batchId: string;
    rowId: string;
    conflictResolution: ReservationImportRowRecord["conflictResolution"];
    replaceBookingIds: string[];
    replaceBookingId: string | null;
    priceSource?: ReservationImportRowRecord["priceSource"];
    operatorTotalAmount?: string | null;
    operatorCurrency?: string | null;
    now: Date;
  }) {
    await this.updateRow(input.rowId, input.tenantId, {
      conflictResolution: input.conflictResolution,
      replaceBookingIds: input.replaceBookingIds,
      replaceBookingId: input.replaceBookingId,
      priceSource: input.priceSource,
      operatorTotalAmount: input.operatorTotalAmount,
      operatorCurrency: input.operatorCurrency,
    });
    return this.listRowsForBatch(input.batchId, input.tenantId);
  }
  async findDurableByExternalReference() {
    return null;
  }
  async cancelDraft(batchId: string, tenantId: string) {
    const b = (await this.findBatchById(batchId, tenantId))!;
    b.status = "cancelled";
    return b;
  }
  async expireDrafts() {
    return { expiredBatches: 0, discardedRows: 0 };
  }

  async lockDraftForCommit(batchId: string, tenantId: string) {
    const batch = await this.findBatchById(batchId, tenantId);
    const rows = batch ? await this.listRowsForBatch(batchId, tenantId) : [];
    return { batch, rows };
  }
}

const actor: ActorContext = { userId: "actor-a", role: "admin", propertyIds: null };

describe("B3.3d operator-entered import price validation", () => {
  it("normalizes positive EUR amounts via Money", () => {
    const out = normalizeOperatorEnteredImportPrice({ amount: "120.5", currency: null });
    expect(out.currency).toBe(RESERVATION_IMPORT_MANUAL_PRICE_DEFAULT_CURRENCY);
    expect(out.amount).toMatch(/^120\.5000$/);
  });

  it("rejects missing amount", () => {
    expect(() => normalizeOperatorEnteredImportPrice({ amount: null })).toThrow(/required/i);
    expect(() => normalizeOperatorEnteredImportPrice({ amount: "  " })).toThrow(/required/i);
  });

  it("rejects zero and negative", () => {
    expect(() => normalizeOperatorEnteredImportPrice({ amount: "0" })).toThrow(/positive/i);
    expect(() => normalizeOperatorEnteredImportPrice({ amount: "-10" })).toThrow(/positive/i);
  });

  it("rejects malformed amounts", () => {
    expect(() => normalizeOperatorEnteredImportPrice({ amount: "abc" })).toThrow();
    expect(() => normalizeOperatorEnteredImportPrice({ amount: "12.34.56" })).toThrow();
  });

  it("use case rejects invalid operator_entered prices without persisting", async () => {
    const imports = new MemoryImports();
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: "tenant-a",
      propertyId: "prop-a",
      actorId: "actor-a",
      filename: "p.csv",
    });
    const row = makeRow(batch.id, { priceSource: "unresolved" });
    imports.rows.set(row.id, row);

    const createDraft = {
      preflightRows: async ({ rows }: { rows: ReservationImportRowRecord[] }) => rows,
    } as unknown as CreateReservationImportDraftUseCase;

    const useCase = new UpdateReservationImportRowDecisionUseCase(imports, createDraft);

    for (const bad of [
      { amount: "0", currency: "EUR" },
      { amount: "-5", currency: "EUR" },
      { amount: "nope", currency: "EUR" },
      { amount: null, currency: "EUR" },
    ] as const) {
      const result = await useCase.execute(
        {
          batchId: batch.id,
          rowId: row.id,
          tenantId: "tenant-a",
          priceSource: "operator_entered",
          operatorTotalAmount: bad.amount,
          operatorCurrency: bad.currency,
        },
        actor,
      );
      expect(result.isFailure).toBe(true);
      const stored = imports.rows.get(row.id)!;
      expect(stored.priceSource).toBe("unresolved");
      expect(stored.operatorTotalAmount).toBeNull();
    }
  });

  it("use case persists valid operator_entered price", async () => {
    const imports = new MemoryImports();
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: "tenant-a",
      propertyId: "prop-a",
      actorId: "actor-a",
      filename: "p.csv",
    });
    const row = makeRow(batch.id);
    imports.rows.set(row.id, row);
    const createDraft = {
      preflightRows: async ({ rows }: { rows: ReservationImportRowRecord[] }) =>
        rows.map((r) => ({ ...r, status: "ready" as const })),
    } as unknown as CreateReservationImportDraftUseCase;

    const useCase = new UpdateReservationImportRowDecisionUseCase(imports, createDraft);
    const result = await useCase.execute(
      {
        batchId: batch.id,
        rowId: row.id,
        tenantId: "tenant-a",
        priceSource: "operator_entered",
        operatorTotalAmount: "99.5",
        operatorCurrency: "EUR",
      },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().priceSource).toBe("operator_entered");
    expect(result.getValue().operatorTotalAmount).toMatch(/^99\.5000$/);
    expect(result.getValue().operatorCurrency).toBe("EUR");
  });
});
