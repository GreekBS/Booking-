import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CreateReservationImportDraftUseCase } from "../../src/commerce/import/CreateReservationImportDraftUseCase";
import {
  UpdateReservationImportRowDecisionUseCase,
  RecheckReservationImportDraftUseCase,
  ListReservationImportDraftsUseCase,
  GetReservationImportDraftUseCase,
  UpdateReservationImportMissingPriceStrategyUseCase,
} from "../../src/commerce/import/ReservationImportDraftDecisionUseCases";
import {
  computeReservationImportDraftExpiresAt,
  RESERVATION_IMPORT_DRAFT_TTL_MS,
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
import type { ICsvImportUnitResolver } from "../../src/commerce/import/csv";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";

function makeBatch(
  overrides: Partial<ReservationImportBatchRecord> = {},
): ReservationImportBatchRecord {
  const createdAt = overrides.createdAt ?? new Date("2026-10-03T10:00:00.000Z");
  return {
    id: overrides.id ?? randomUUID(),
    tenantId: overrides.tenantId ?? "tenant-a",
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
    priceSource: overrides.priceSource ?? "imported_csv",
    importedTotalAmount: overrides.importedTotalAmount ?? "100.0000",
    importedCurrency: overrides.importedCurrency ?? "EUR",
    operatorTotalAmount: overrides.operatorTotalAmount ?? null,
    operatorCurrency: overrides.operatorCurrency ?? null,
    conflictResolution: overrides.conflictResolution ?? "undecided",
    replaceBookingId: overrides.replaceBookingId ?? null,
    replaceBookingIds: overrides.replaceBookingIds ?? [],
    conflictSnapshot: overrides.conflictSnapshot ?? {
      version: 1,
      existingBookingIds: ["booking-1", "booking-2"],
      peerImportRowIds: [],
      nonBookingBlockers: [],
      overlaps: [],
    },
    conflictGroupId: overrides.conflictGroupId ?? null,
    recheckRequired: overrides.recheckRequired ?? false,
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
  rejected = new Map<string, import("../../src/commerce/import/ReservationImportTypes").ReservationImportRejectedRowRecord>();

  async createBatch(input: CreateReservationImportBatchInput) {
    const now = input.now ?? new Date();
    const batch = makeBatch({
      id: input.id,
      tenantId: input.tenantId,
      actorId: input.actorId,
      filename: input.filename,
      createdAt: now,
      expiresAt: computeReservationImportDraftExpiresAt(now),
      missingPriceStrategy: input.missingPriceStrategy ?? "undecided",
      rowCount: input.rowCount ?? 0,
    });
    this.batches.set(batch.id, batch);
    return batch;
  }

  async findBatchById(batchId: string, tenantId: string) {
    const b = this.batches.get(batchId);
    return b && b.tenantId === tenantId ? b : null;
  }

  async listResumableDrafts(tenantId: string, now: Date = new Date()) {
    return [...this.batches.values()].filter(
      (b) =>
        b.tenantId === tenantId &&
        b.status === "draft" &&
        b.expiresAt.getTime() > now.getTime(),
    );
  }

  async updateBatch(
    batchId: string,
    tenantId: string,
    patch: UpdateReservationImportBatchInput,
    now: Date = new Date(),
  ) {
    const b = await this.findBatchById(batchId, tenantId);
    if (!b) throw new Error("not found");
    if (b.status === "draft" && b.expiresAt.getTime() <= now.getTime()) {
      throw new Error("Import draft has expired");
    }
    const next = { ...b, ...patch, updatedAt: now };
    this.batches.set(batchId, next as ReservationImportBatchRecord);
    return next as ReservationImportBatchRecord;
  }

  async cancelDraft(batchId: string, tenantId: string) {
    const b = await this.findBatchById(batchId, tenantId);
    if (!b) throw new Error("not found");
    for (const [id, r] of this.rejected) {
      if (r.batchId === batchId && r.tenantId === tenantId) this.rejected.delete(id);
    }
    const next = { ...b, status: "cancelled" as const };
    this.batches.set(batchId, next);
    return next;
  }

  async createRows(inputs: CreateReservationImportRowInput[]) {
    const out: ReservationImportRowRecord[] = [];
    for (const input of inputs) {
      const row = makeRow(input.batchId, {
        id: input.id,
        ...input,
        replaceBookingIds: input.replaceBookingIds ?? [],
      } as Partial<ReservationImportRowRecord>);
      this.rows.set(row.id, row);
      out.push(row);
    }
    return out;
  }

  async listRowsForBatch(batchId: string, tenantId: string) {
    return [...this.rows.values()]
      .filter((r) => r.batchId === batchId && r.tenantId === tenantId)
      .sort((a, b) => a.rowNumber - b.rowNumber);
  }

  async updateRow(
    rowId: string,
    tenantId: string,
    patch: UpdateReservationImportRowInput,
    now: Date = new Date(),
  ) {
    const row = this.rows.get(rowId);
    if (!row || row.tenantId !== tenantId) throw new Error("row not found");
    const batch = this.batches.get(row.batchId);
    if (batch?.status === "draft" && batch.expiresAt.getTime() <= now.getTime()) {
      throw new Error("Import draft has expired");
    }
    const next = { ...row, ...patch, updatedAt: now } as ReservationImportRowRecord;
    this.rows.set(rowId, next);
    return next;
  }

  async findDurableByExternalReference() {
    return null;
  }

  async createRejectedRows(
    inputs: import("../../src/commerce/import/ReservationImportTypes").CreateReservationImportRejectedRowInput[],
  ) {
    const out = [];
    for (const input of inputs) {
      const row = {
        id: input.id,
        tenantId: input.tenantId,
        batchId: input.batchId,
        rowNumber: input.rowNumber,
        payload: input.payload ?? {},
        errors: input.errors ?? [],
        warnings: input.warnings ?? [],
        createdAt: new Date(),
      };
      this.rejected.set(row.id, row);
      out.push(row);
    }
    return out;
  }

  async listRejectedRowsForBatch(batchId: string, tenantId: string) {
    return [...this.rejected.values()]
      .filter((r) => r.batchId === batchId && r.tenantId === tenantId)
      .sort((a, b) => a.rowNumber - b.rowNumber);
  }

  async applyConflictDecisionAtomic(input: {
    tenantId: string;
    batchId: string;
    rowId: string;
    conflictResolution: import("../../src/commerce/import/ReservationImportTypes").ReservationImportConflictResolution;
    replaceBookingIds: string[];
    replaceBookingId: string | null;
    priceSource?: import("../../src/commerce/import/ReservationImportTypes").ReservationImportPriceSource;
    operatorTotalAmount?: string | null;
    operatorCurrency?: string | null;
    now?: Date;
  }) {
    const { importRowsOverlap } = await import(
      "../../src/commerce/import/ReservationImportExclusivity"
    );
    const now = input.now ?? new Date();
    const primary = this.rows.get(input.rowId);
    if (!primary || primary.tenantId !== input.tenantId || primary.batchId !== input.batchId) {
      throw new Error("row not found");
    }
    await this.updateRow(
      input.rowId,
      input.tenantId,
      {
        conflictResolution: input.conflictResolution,
        replaceBookingIds: input.replaceBookingIds,
        replaceBookingId: input.replaceBookingId,
        priceSource: input.priceSource,
        operatorTotalAmount: input.operatorTotalAmount,
        operatorCurrency: input.operatorCurrency,
      },
      now,
    );
    if (input.conflictResolution === "keep_csv") {
      for (const peer of this.rows.values()) {
        if (peer.id === input.rowId) continue;
        if (peer.batchId !== input.batchId || peer.tenantId !== input.tenantId) continue;
        if (peer.conflictResolution !== "keep_csv") continue;
        if (!importRowsOverlap(primary, peer)) continue;
        await this.updateRow(
          peer.id,
          input.tenantId,
          {
            conflictResolution: "keep_existing",
            replaceBookingIds: [],
            replaceBookingId: null,
          },
          now,
        );
      }
    }
    return this.listRowsForBatch(input.batchId, input.tenantId);
  }

  async expireDrafts() {
    return { expiredBatches: 0, discardedRows: 0 };
  }
}

const actor: ActorContext = {
  userId: "actor-a",
  role: "admin",
  propertyIds: null,
};

describe("ReservationImport B2 decisions + logical expiry", () => {
  it("keep_csv stores all overlapping booking ids in replaceBookingIds", async () => {
    const imports = new MemoryImports();
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: "tenant-a",
      actorId: "actor-a",
      filename: "x.csv",
      now: new Date("2026-10-03T10:00:00.000Z"),
    });
    const row = makeRow(batch.id);
    imports.rows.set(row.id, row);
    imports.batches.set(batch.id, batch);

    const createDraft = {
      preflightRows: async ({ rows }: { rows: ReservationImportRowRecord[] }) =>
        rows.map((r) => ({
          ...r,
          status: "ready" as const,
          replaceBookingIds: r.replaceBookingIds,
          replaceBookingId: r.replaceBookingId,
        })),
    } as unknown as CreateReservationImportDraftUseCase;

    const useCase = new UpdateReservationImportRowDecisionUseCase(
      imports,
      createDraft,
    );
    const result = await useCase.execute(
      {
        batchId: batch.id,
        rowId: row.id,
        tenantId: "tenant-a",
        conflictResolution: "keep_csv",
        now: new Date("2026-10-03T11:00:00.000Z"),
      },
      actor,
    );
    if (result.isFailure) {
      throw result.getError();
    }
    const updated = result.getValue();
    expect(updated.replaceBookingIds).toEqual(["booking-1", "booking-2"]);
    expect(updated.replaceBookingId).toBe("booking-1");
  });

  it("keep_csv demotes overlapping peer keep_csv but not non-overlapping chain peer", async () => {
    const imports = new MemoryImports();
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: "tenant-a",
      actorId: "actor-a",
      filename: "chain.csv",
      now: new Date("2026-10-03T10:00:00.000Z"),
    });
    const a = makeRow(batch.id, {
      id: randomUUID(),
      rowNumber: 1,
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      conflictResolution: "undecided",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    const b = makeRow(batch.id, {
      id: randomUUID(),
      rowNumber: 2,
      checkIn: "2026-10-11",
      checkOut: "2026-10-13",
      conflictResolution: "keep_csv",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    const c = makeRow(batch.id, {
      id: randomUUID(),
      rowNumber: 3,
      checkIn: "2026-10-12",
      checkOut: "2026-10-14",
      conflictResolution: "keep_csv",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    imports.rows.set(a.id, a);
    imports.rows.set(b.id, b);
    imports.rows.set(c.id, c);

    const createDraft = {
      preflightRows: async ({ rows }: { rows: ReservationImportRowRecord[] }) => rows,
    } as unknown as CreateReservationImportDraftUseCase;

    const useCase = new UpdateReservationImportRowDecisionUseCase(imports, createDraft);
    const result = await useCase.execute(
      {
        batchId: batch.id,
        rowId: a.id,
        tenantId: "tenant-a",
        conflictResolution: "keep_csv",
        now: new Date("2026-10-03T11:00:00.000Z"),
      },
      actor,
    );
    if (result.isFailure) throw result.getError();

    expect(imports.rows.get(a.id)!.conflictResolution).toBe("keep_csv");
    expect(imports.rows.get(b.id)!.conflictResolution).toBe("keep_existing");
    expect(imports.rows.get(c.id)!.conflictResolution).toBe("keep_csv");
  });

  it("blocks decisions after expiresAt even when rows are still present (no worker cleanup)", async () => {
    const imports = new MemoryImports();
    const createdAt = new Date("2026-10-03T10:00:00.000Z");
    const batch = await imports.createBatch({
      id: randomUUID(),
      tenantId: "tenant-a",
      actorId: "actor-a",
      filename: "expired.csv",
      now: createdAt,
    });
    const row = makeRow(batch.id);
    imports.rows.set(row.id, row);

    const createDraft = {
      preflightRows: async ({ rows }: { rows: ReservationImportRowRecord[] }) => rows,
    } as unknown as CreateReservationImportDraftUseCase;

    const decision = new UpdateReservationImportRowDecisionUseCase(imports, createDraft);
    const strategy = new UpdateReservationImportMissingPriceStrategyUseCase(
      imports,
      createDraft,
    );
    const recheck = new RecheckReservationImportDraftUseCase(imports, createDraft);
    const get = new GetReservationImportDraftUseCase(imports);
    const list = new ListReservationImportDraftsUseCase(imports);

    const justBefore = new Date(createdAt.getTime() + RESERVATION_IMPORT_DRAFT_TTL_MS - 1000);
    const listBefore = await list.execute("tenant-a", actor, justBefore);
    expect(listBefore.isSuccess).toBe(true);
    expect(listBefore.getValue().length).toBe(1);

    const atExpiry = computeReservationImportDraftExpiresAt(createdAt);
    expect(batch.expiresAt.getTime() - createdAt.getTime()).toBe(RESERVATION_IMPORT_DRAFT_TTL_MS);

    // Rows still in memory — worker has not cleaned anything.
    expect(imports.rows.size).toBe(1);
    expect(batch.status).toBe("draft");

    const decisionResult = await decision.execute(
      {
        batchId: batch.id,
        rowId: row.id,
        tenantId: "tenant-a",
        conflictResolution: "keep_existing",
        now: atExpiry,
      },
      actor,
    );
    expect(decisionResult.isFailure).toBe(true);
    expect(decisionResult.getError().message).toMatch(/expired/i);

    const strategyResult = await strategy.execute(
      {
        batchId: batch.id,
        tenantId: "tenant-a",
        missingPriceStrategy: "per_row",
        now: atExpiry,
      },
      actor,
    );
    expect(strategyResult.isFailure).toBe(true);

    const recheckResult = await recheck.execute(batch.id, "tenant-a", actor, atExpiry);
    expect(recheckResult.isFailure).toBe(true);

    const getResult = await get.execute(batch.id, "tenant-a", actor, atExpiry);
    expect(getResult.isFailure).toBe(true);

    expect((await list.execute("tenant-a", actor, atExpiry)).getValue()).toHaveLength(0);
  });
});

describe("CsvImportUnitResolver contract (in-memory)", () => {
  it("resolves unambiguous unit refs", async () => {
    const resolver: ICsvImportUnitResolver = {
      async resolve(_tenantId, unitRef) {
        if (unitRef === "Studio A") {
          return { status: "resolved", unitId: "unit-a", propertyId: "prop-a" };
        }
        return { status: "ambiguous", candidateIds: ["1", "2"] };
      },
    };
    expect((await resolver.resolve("t", "Studio A")).status).toBe("resolved");
    expect((await resolver.resolve("t", "Amb")).status).toBe("ambiguous");
  });
});
