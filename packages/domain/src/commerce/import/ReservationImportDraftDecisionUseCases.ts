import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ActorContext } from "../../shared/services/PermissionChecker";
import { PermissionChecker } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import {
  canResumeReservationImportDraft,
  type ReservationImportBatchRecord,
  type ReservationImportConflictBookingRecord,
  type ReservationImportConflictResolution,
  type ReservationImportMissingPriceStrategy,
  type ReservationImportPriceSource,
  type ReservationImportRejectedRowRecord,
  type ReservationImportRowRecord,
} from "./ReservationImportTypes";
import { normalizeOperatorEnteredImportPrice } from "./ReservationImportOperatorPrice";
import type { IBookingRepository } from "../ports/CommercePorts";
import type { IReservationImportRepository } from "./IReservationImportRepository";
import { collectConflictBookingIdsFromImportRows } from "./ReservationImportExclusivity";
import type { CreateReservationImportDraftUseCase } from "./CreateReservationImportDraftUseCase";
import {
  parseConflictSnapshot,
} from "./ReservationImportConflictGraph";

function assertBookingCreate(
  checker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): void {
  checker.assertPermission(actor, PERMISSIONS.BOOKING_CREATE_TENANT, tenantId);
}

export class ListReservationImportDraftsUseCase {
  constructor(
    private readonly imports: IReservationImportRepository,
    private readonly permissionChecker: PermissionChecker = new PermissionChecker(),
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    now: Date = new Date(),
  ): Promise<Result<ReservationImportBatchRecord[], Error>> {
    try {
      assertBookingCreate(this.permissionChecker, actor, tenantId);
      return Result.ok(await this.imports.listResumableDrafts(tenantId, now));
    } catch (e) {
      return Result.fail(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export class GetReservationImportDraftUseCase {
  constructor(
    private readonly imports: IReservationImportRepository,
    private readonly permissionChecker: PermissionChecker = new PermissionChecker(),
    private readonly bookings?: IBookingRepository,
  ) {}

  async execute(
    batchId: string,
    tenantId: string,
    actor: ActorContext,
    now: Date = new Date(),
  ): Promise<
    Result<
      {
        batch: ReservationImportBatchRecord;
        rows: ReservationImportRowRecord[];
        rejectedRows: ReservationImportRejectedRowRecord[];
        conflictBookings: ReservationImportConflictBookingRecord[];
      },
      Error
    >
  > {
    try {
      assertBookingCreate(this.permissionChecker, actor, tenantId);
      const batch = await this.imports.findBatchById(batchId, tenantId);
      if (!batch) return Result.fail(new ValidationError("Import draft not found"));
      if (!canResumeReservationImportDraft(batch, now) && batch.status === "draft") {
        return Result.fail(new ValidationError("Import draft has expired"));
      }
      const rows = await this.imports.listRowsForBatch(batchId, tenantId);
      const rejectedRows = await this.imports.listRejectedRowsForBatch(batchId, tenantId);
      const conflictBookings = await this.loadConflictBookings(rows, tenantId);
      return Result.ok({ batch, rows, rejectedRows, conflictBookings });
    } catch (e) {
      return Result.fail(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private async loadConflictBookings(
    rows: ReservationImportRowRecord[],
    tenantId: string,
  ): Promise<ReservationImportConflictBookingRecord[]> {
    if (!this.bookings) return [];
    const ids = collectConflictBookingIdsFromImportRows(rows);
    if (ids.length === 0) return [];
    const bookings = await this.bookings.findByIds(ids, tenantId);
    const byId = new Map(
      bookings.map((b) => [
        b.id,
        {
          id: b.id,
          guestName: b.guest.name,
          checkIn: b.stayPeriod.checkIn.value,
          checkOut: b.stayPeriod.checkOut.value,
        } satisfies ReservationImportConflictBookingRecord,
      ]),
    );
    return ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  }
}

export class DiscardReservationImportDraftUseCase {
  constructor(
    private readonly imports: IReservationImportRepository,
    private readonly permissionChecker: PermissionChecker = new PermissionChecker(),
  ) {}

  async execute(
    batchId: string,
    tenantId: string,
    actor: ActorContext,
    now: Date = new Date(),
  ): Promise<Result<ReservationImportBatchRecord, Error>> {
    try {
      assertBookingCreate(this.permissionChecker, actor, tenantId);
      return Result.ok(await this.imports.cancelDraft(batchId, tenantId, now));
    } catch (e) {
      return Result.fail(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export class UpdateReservationImportMissingPriceStrategyUseCase {
  constructor(
    private readonly imports: IReservationImportRepository,
    private readonly createDraft: CreateReservationImportDraftUseCase,
    private readonly permissionChecker: PermissionChecker = new PermissionChecker(),
  ) {}

  async execute(
    input: {
      batchId: string;
      tenantId: string;
      missingPriceStrategy: ReservationImportMissingPriceStrategy;
      now?: Date;
    },
    actor: ActorContext,
  ): Promise<
    Result<{ batch: ReservationImportBatchRecord; rows: ReservationImportRowRecord[] }, Error>
  > {
    try {
      assertBookingCreate(this.permissionChecker, actor, input.tenantId);
      const now = input.now ?? new Date();
      const existing = await this.imports.findBatchById(input.batchId, input.tenantId);
      if (!existing) return Result.fail(new ValidationError("Import draft not found"));
      if (!canResumeReservationImportDraft(existing, now)) {
        return Result.fail(new ValidationError("Import draft has expired"));
      }
      const batch = await this.imports.updateBatch(
        input.batchId,
        input.tenantId,
        { missingPriceStrategy: input.missingPriceStrategy },
        now,
      );
      let rows = await this.imports.listRowsForBatch(input.batchId, input.tenantId);
      rows = await this.createDraft.preflightRows({
        tenantId: input.tenantId,
        rows,
        missingPriceStrategy: batch.missingPriceStrategy,
        now,
      });
      return Result.ok({ batch, rows });
    } catch (e) {
      return Result.fail(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export class UpdateReservationImportRowDecisionUseCase {
  constructor(
    private readonly imports: IReservationImportRepository,
    private readonly createDraft: CreateReservationImportDraftUseCase,
    private readonly permissionChecker: PermissionChecker = new PermissionChecker(),
    private readonly pricing?: {
      previewTotal(input: {
        tenantId: string;
        unitId: string;
        checkIn: string;
        checkOut: string;
      }): Promise<{ amount: string; currency: string } | null>;
    },
  ) {}

  async execute(
    input: {
      batchId: string;
      rowId: string;
      tenantId: string;
      conflictResolution?: ReservationImportConflictResolution;
      priceSource?: ReservationImportPriceSource;
      operatorTotalAmount?: string | null;
      operatorCurrency?: string | null;
      now?: Date;
    },
    actor: ActorContext,
  ): Promise<Result<ReservationImportRowRecord, Error>> {
    try {
      assertBookingCreate(this.permissionChecker, actor, input.tenantId);
      const now = input.now ?? new Date();
      const batch = await this.imports.findBatchById(input.batchId, input.tenantId);
      if (!batch) return Result.fail(new ValidationError("Import draft not found"));
      if (!canResumeReservationImportDraft(batch, now)) {
        return Result.fail(new ValidationError("Import draft has expired"));
      }

      const rows = await this.imports.listRowsForBatch(input.batchId, input.tenantId);
      const row = rows.find((r) => r.id === input.rowId);
      if (!row || row.batchId !== input.batchId) {
        return Result.fail(new ValidationError("Import row not found"));
      }

      const priceSource = input.priceSource ?? row.priceSource;
      let operatorTotalAmount =
        input.operatorTotalAmount !== undefined
          ? input.operatorTotalAmount
          : row.operatorTotalAmount;
      let operatorCurrency =
        input.operatorCurrency !== undefined
          ? input.operatorCurrency
          : row.operatorCurrency;

      if (priceSource === "talos_calculated" && this.pricing) {
        const priced = await this.pricing.previewTotal({
          tenantId: input.tenantId,
          unitId: row.unitId,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
        });
        if (!priced) {
          return Result.fail(new ValidationError("TALOS could not calculate a price"));
        }
        operatorTotalAmount = priced.amount;
        operatorCurrency = priced.currency;
      } else if (priceSource === "operator_entered") {
        const normalized = normalizeOperatorEnteredImportPrice({
          amount: operatorTotalAmount,
          currency: operatorCurrency,
        });
        operatorTotalAmount = normalized.amount;
        operatorCurrency = normalized.currency;
      }

      const conflictResolution = input.conflictResolution ?? row.conflictResolution;
      let replaceBookingIds = row.replaceBookingIds ?? [];
      let replaceBookingId = row.replaceBookingId;
      const snapshot = parseConflictSnapshot(row.conflictSnapshot);

      if (conflictResolution === "keep_existing") {
        replaceBookingIds = [];
        replaceBookingId = null;
      } else if (conflictResolution === "keep_csv") {
        replaceBookingIds = [...snapshot.existingBookingIds];
        replaceBookingId = replaceBookingIds[0] ?? null;
        if (snapshot.existingBookingIds.length === 0 && snapshot.peerImportRowIds.length > 0) {
          replaceBookingIds = [];
          replaceBookingId = null;
        }
      }

      // Conflict decisions use atomic unit locking + peer demotion for exclusivity.
      // Price-only updates still use single-row update.
      let refreshed: ReservationImportRowRecord[];
      if (input.conflictResolution !== undefined) {
        refreshed = await this.imports.applyConflictDecisionAtomic({
          tenantId: input.tenantId,
          batchId: input.batchId,
          rowId: input.rowId,
          conflictResolution,
          replaceBookingIds,
          replaceBookingId,
          priceSource,
          operatorTotalAmount,
          operatorCurrency,
          now,
        });
      } else {
        await this.imports.updateRow(
          input.rowId,
          input.tenantId,
          {
            priceSource,
            operatorTotalAmount,
            operatorCurrency,
          },
          now,
        );
        refreshed = await this.imports.listRowsForBatch(input.batchId, input.tenantId);
      }

      const preflighted = await this.createDraft.preflightRows({
        tenantId: input.tenantId,
        rows: refreshed,
        missingPriceStrategy: batch.missingPriceStrategy,
        now,
      });
      const out = preflighted.find((r) => r.id === input.rowId);
      return Result.ok(out!);
    } catch (e) {
      return Result.fail(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export class RecheckReservationImportDraftUseCase {
  constructor(
    private readonly imports: IReservationImportRepository,
    private readonly createDraft: CreateReservationImportDraftUseCase,
    private readonly permissionChecker: PermissionChecker = new PermissionChecker(),
  ) {}

  async execute(
    batchId: string,
    tenantId: string,
    actor: ActorContext,
    now: Date = new Date(),
  ): Promise<
    Result<{ batch: ReservationImportBatchRecord; rows: ReservationImportRowRecord[] }, Error>
  > {
    try {
      assertBookingCreate(this.permissionChecker, actor, tenantId);
      const batch = await this.imports.findBatchById(batchId, tenantId);
      if (!batch) return Result.fail(new ValidationError("Import draft not found"));
      if (!canResumeReservationImportDraft(batch, now)) {
        return Result.fail(new ValidationError("Import draft has expired"));
      }

      // Invalidate prior conflict decisions that may be stale
      let rows = await this.imports.listRowsForBatch(batchId, tenantId);
      for (const row of rows) {
        const snap = parseConflictSnapshot(row.conflictSnapshot);
        if (
          row.conflictResolution !== "undecided" ||
          (row.replaceBookingIds?.length ?? 0) > 0
        ) {
          await this.imports.updateRow(
            row.id,
            tenantId,
            {
              conflictResolution: "undecided",
              replaceBookingIds: [],
              replaceBookingId: null,
              recheckRequired: true,
              conflictSnapshot: {
                ...snap,
                priorDecisionInvalidated: true,
              } as unknown as Record<string, unknown>,
            },
            now,
          );
        }
      }

      rows = await this.imports.listRowsForBatch(batchId, tenantId);
      rows = await this.createDraft.preflightRows({
        tenantId,
        rows,
        missingPriceStrategy: batch.missingPriceStrategy,
        now,
      });
      const refreshed = await this.imports.findBatchById(batchId, tenantId);
      return Result.ok({ batch: refreshed!, rows });
    } catch (e) {
      return Result.fail(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
