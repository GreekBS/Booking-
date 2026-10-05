import { Result } from "../../shared/kernel/Result";
import { ValidationError, ConflictError } from "../../shared/errors/DomainError";
import type { ActorContext } from "../../shared/services/PermissionChecker";
import { PermissionChecker } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { mutationOriginOperator } from "../../shared/types/MutationOrigin";
import { Hold } from "../booking/domain/Hold";
import { Quote } from "../booking/domain/Quote";
import { Booking } from "../booking/domain/Booking";
import { Money } from "../shared/value-objects/Money";
import type {
  IAvailabilityRulesRepository,
  IBookingRepository,
  ICalendarBlockRepository,
  ICatalogQueryPort,
  ICommerceFlowRepository,
  ITimezoneService,
} from "../ports/CommercePorts";
import { resolveUnitContext } from "../application/commerceAccess";
import { StayAvailabilityEngine } from "../reservation/engines/StayAvailabilityEngine";
import { ResolveOrCreateGuest } from "../../guests";
import type { IReservationImportRepository } from "./IReservationImportRepository";
import {
  evaluateReservationImportCommitEligibility,
  type CommitRowPlan,
} from "./ReservationImportCommitEligibility";
import { resolveFrozenImportCommitPrice } from "./ReservationImportCommitPricing";
import {
  assertAvailabilityAllowsImport,
  assertKeepCsvReplaceTargetsValid,
  assertNoNonBookingBlockers,
  assertPeerExclusivityForCommit,
  csvImportSupersedeReason,
  importAvailabilityPolicyForRow,
  scanImportCalendarConflicts,
} from "./ReservationImportCommitRevalidation";
import {
  CSV_RESERVATION_IMPORT_NAMESPACE,
  type ReservationImportBatchRecord,
  type ReservationImportRowRecord,
} from "./ReservationImportTypes";

export interface ReservationImportCommitSummary {
  imported: number;
  skipped: number;
  createdBookingIds: string[];
  supersededBookingIds: string[];
  skippedRowIds: string[];
}

export interface ReservationImportCommitResult {
  batch: ReservationImportBatchRecord;
  rows: ReservationImportRowRecord[];
  summary: ReservationImportCommitSummary;
  /** True when the batch was already completed (idempotent retry). */
  alreadyCompleted: boolean;
}

/**
 * Phase C1 — atomic whole-batch CSV import commit.
 *
 * keep_csv ordering (hard requirement, same tenant TX):
 * lock + revalidate → release ALL replaceBookingIds → persist successor X →
 * persist supersede A…N → X → update import row.
 *
 * Does NOT wire messagingActivation / channel links / payment workflows.
 */
export class CommitReservationImportBatchUseCase {
  private readonly availability: StayAvailabilityEngine;

  constructor(
    private readonly imports: IReservationImportRepository,
    private readonly commerceFlow: ICommerceFlowRepository,
    private readonly bookings: IBookingRepository,
    private readonly catalog: ICatalogQueryPort,
    private readonly calendarBlocks: ICalendarBlockRepository,
    availabilityRules: IAvailabilityRulesRepository,
    timezoneService: ITimezoneService,
    private readonly resolveOrCreateGuest: ResolveOrCreateGuest,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker = new PermissionChecker(),
  ) {
    this.availability = new StayAvailabilityEngine(
      catalog,
      calendarBlocks,
      availabilityRules,
      timezoneService,
    );
  }

  async execute(
    batchId: string,
    tenantId: string,
    actor: ActorContext,
    now: Date = new Date(),
  ): Promise<Result<ReservationImportCommitResult, Error>> {
    try {
      this.permissionChecker.assertPermission(
        actor,
        PERMISSIONS.BOOKING_CREATE_TENANT,
        tenantId,
      );

      // Idempotent completed-batch short-circuit (no TX mutation).
      const existing = await this.imports.findBatchById(batchId, tenantId);
      if (!existing) {
        return Result.fail(new ValidationError("Import draft not found"));
      }
      if (existing.status === "completed") {
        const rows = await this.imports.listRowsForBatch(batchId, tenantId);
        return Result.ok(this.buildCompletedResult(existing, rows, true));
      }

      const origin = mutationOriginOperator();
      const createdBookingIds: string[] = [];
      const supersededBookingIds: string[] = [];
      const skippedRowIds: string[] = [];

      await this.commerceFlow.runInTenantTransaction(tenantId, async () => {
        const locked = await this.imports.lockDraftForCommit(batchId, tenantId);
        if (!locked.batch) {
          throw new ValidationError("Import draft not found");
        }
        if (locked.batch.status === "completed") {
          // Concurrent commit won — treat as idempotent (no further mutation).
          return;
        }

        const eligibility = evaluateReservationImportCommitEligibility({
          batch: locked.batch,
          rows: locked.rows,
          now,
        });
        if (eligibility.isFailure) {
          throw eligibility.getError();
        }

        const plans = eligibility.getValue().plans;
        const importPlans = plans.filter(
          (p): p is Extract<CommitRowPlan, { kind: "import" }> => p.kind === "import",
        );
        assertPeerExclusivityForCommit(importPlans.map((p) => p.row));

        // Lock all replace targets up-front (sorted UUID order).
        const allReplaceIds = [
          ...new Set(
            importPlans.flatMap((p) =>
              p.row.conflictResolution === "keep_csv"
                ? (p.row.replaceBookingIds ?? [])
                : [],
            ),
          ),
        ].sort();
        if (allReplaceIds.length > 0) {
          const lockedTargets = await this.bookings.lockByIdsForUpdate(
            allReplaceIds,
            tenantId,
          );
          if (lockedTargets.length !== allReplaceIds.length) {
            throw new ConflictError(
              "Import commit blocked: one or more replaceBookingIds not found — recheck required",
            );
          }
        }

        // Authoritative revalidation for every import row before any mutation.
        for (const plan of importPlans) {
          await this.revalidateImportRow(plan.row, tenantId);
        }

        for (const plan of plans) {
          if (plan.kind === "durable_skip") {
            if (plan.reason === "already_imported") {
              // Identity already owned by another durable row — cannot claim again
              // (partial unique index). Finalize as processed advisory skip.
              await this.imports.updateRow(
                plan.row.id,
                tenantId,
                {
                  status: "skipped",
                  processedAt: now,
                  errorCode: "ALREADY_IMPORTED",
                  errorMessage: `External reference already imported: ${plan.row.externalReference}`,
                },
                now,
              );
            } else {
              await this.imports.updateRow(
                plan.row.id,
                tenantId,
                {
                  status: "skipped_already_imported",
                  processedAt: now,
                  errorCode: "KEEP_EXISTING",
                  errorMessage: "Operator chose to keep existing occupancy",
                },
                now,
              );
            }
            skippedRowIds.push(plan.row.id);
            continue;
          }

          const created = await this.commitImportRow(plan.row, tenantId, actor, origin, now);
          createdBookingIds.push(created.bookingId);
          supersededBookingIds.push(...created.supersededIds);
        }

        await this.imports.updateBatch(
          batchId,
          tenantId,
          { status: "completed", committedAt: now },
          now,
        );
      });

      const batch = (await this.imports.findBatchById(batchId, tenantId))!;
      const rows = await this.imports.listRowsForBatch(batchId, tenantId);

      if (batch.status === "completed" && createdBookingIds.length === 0 && skippedRowIds.length === 0) {
        // Concurrent idempotent path inside TX.
        return Result.ok(this.buildCompletedResult(batch, rows, true));
      }

      return Result.ok({
        batch,
        rows,
        alreadyCompleted: false,
        summary: {
          imported: createdBookingIds.length,
          skipped: skippedRowIds.length,
          createdBookingIds,
          supersededBookingIds: [...new Set(supersededBookingIds)],
          skippedRowIds,
        },
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private buildCompletedResult(
    batch: ReservationImportBatchRecord,
    rows: ReservationImportRowRecord[],
    alreadyCompleted: boolean,
  ): ReservationImportCommitResult {
    const createdBookingIds = rows
      .filter((r) => r.status === "imported" && r.createdBookingId)
      .map((r) => r.createdBookingId!);
    const skippedRowIds = rows
      .filter(
        (r) =>
          r.status === "skipped_already_imported" ||
          (r.status === "skipped" &&
            (r.errorCode === "ALREADY_IMPORTED" || r.errorCode === "KEEP_EXISTING") &&
            r.processedAt != null),
      )
      .map((r) => r.id);
    const supersededBookingIds = rows.flatMap((r) => {
      const payload = r.payload ?? {};
      const ids = payload.supersededBookingIds;
      return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [];
    });
    return {
      batch,
      rows,
      alreadyCompleted,
      summary: {
        imported: createdBookingIds.length,
        skipped: skippedRowIds.length,
        createdBookingIds,
        supersededBookingIds: [...new Set(supersededBookingIds)],
        skippedRowIds,
      },
    };
  }

  private async revalidateImportRow(
    row: ReservationImportRowRecord,
    tenantId: string,
  ): Promise<void> {
    const unitCtx = await resolveUnitContext(this.catalog, row.unitId, tenantId);
    if (unitCtx.isFailure) {
      throw unitCtx.getError();
    }

    const durable = await this.imports.findDurableByExternalReference({
      tenantId,
      sourceNamespace: CSV_RESERVATION_IMPORT_NAMESPACE,
      externalReference: row.externalReference,
    });
    if (durable && durable.id !== row.id) {
      throw new ConflictError(
        `Import commit blocked: externalReference already owned by another durable row — ${row.externalReference}`,
      );
    }

    // Price structural validation (frozen).
    resolveFrozenImportCommitPrice(row);

    const replaceIds =
      row.conflictResolution === "keep_csv" ? [...(row.replaceBookingIds ?? [])] : [];
    const sortedReplace = [...replaceIds].sort();

    const availability = await this.availability.evaluate({
      tenantId,
      unitId: row.unitId,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      guestCount: row.guestCount,
      policy: importAvailabilityPolicyForRow(row),
      excludeSourceIds: sortedReplace,
    });
    if (availability.isFailure) {
      throw availability.getError();
    }
    assertAvailabilityAllowsImport(row, availability.getValue());

    const blocks = await this.calendarBlocks.findActiveBlocks(row.unitId, tenantId);
    const scanned = scanImportCalendarConflicts({
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      activeBlocks: blocks,
      excludeSourceIds: sortedReplace,
    });
    assertNoNonBookingBlockers(row, scanned.nonBookingBlockers);

    if (row.conflictResolution === "keep_csv") {
      const targets = await this.bookings.lockByIdsForUpdate(sortedReplace, tenantId);
      // Live conflicts for keep_csv MUST equal replaceBookingIds (no exclude).
      const liveScan = scanImportCalendarConflicts({
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        activeBlocks: blocks,
      });
      assertNoNonBookingBlockers(row, liveScan.nonBookingBlockers);
      assertKeepCsvReplaceTargetsValid({
        row,
        liveExistingBookingIds: liveScan.existingBookingIds,
        targets,
      });
    } else if (scanned.existingBookingIds.length > 0) {
      throw new ConflictError(
        `Import commit blocked: row ${row.rowNumber} has unresolved booking conflicts — recheck required`,
      );
    }
  }

  private async commitImportRow(
    row: ReservationImportRowRecord,
    tenantId: string,
    actor: ActorContext,
    origin: ReturnType<typeof mutationOriginOperator>,
    now: Date,
  ): Promise<{ bookingId: string; supersededIds: string[] }> {
    const unitCtx = await resolveUnitContext(this.catalog, row.unitId, tenantId);
    if (unitCtx.isFailure) {
      throw unitCtx.getError();
    }
    const { property } = unitCtx.getValue();
    const frozen = resolveFrozenImportCommitPrice(row);

    const holdId = this.idGenerator.generate();
    const quoteId = this.idGenerator.generate();
    const snapshotId = this.idGenerator.generate();
    const bookingId = this.idGenerator.generate();

    const replaceIds =
      row.conflictResolution === "keep_csv"
        ? [...(row.replaceBookingIds ?? [])].sort()
        : [];

    // Pre-allocate aggregates in memory (no persistence yet).
    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId: row.unitId,
      propertyId: property.id,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      guestCount: row.guestCount,
      sessionRef: `csv:${row.id.replace(/-/g, "").slice(0, 28)}`,
      ttlSeconds: 60 * 60,
      now,
      mutationOrigin: origin,
    });

    const quote = Quote.createFromFixedTotal({
      id: quoteId,
      snapshotId,
      hold,
      propertyTimezone: property.timezone,
      total: Money.create(frozen.amount, frozen.currency),
      pricingMode: frozen.pricingMode,
      quotedAt: now,
    });

    const booking = Booking.create({
      id: bookingId,
      hold,
      quote,
      guest: {
        name: row.guestName,
        email: row.guestEmail,
        phone: row.guestPhone,
      },
      confirmationMode: "manual",
      now,
      mutationOrigin: origin,
    });

    if (row.temporalClass === "historical") {
      booking.finalizeAsHistoricalImport(now, origin);
    } else {
      // future / in_progress — confirm without messagingActivation.
      if (booking.status === "pending") {
        booking.confirm(now, origin);
      }
    }

    // Mandatory keep_csv order: release ALL replace targets BEFORE persisting X.
    for (const oldId of replaceIds) {
      await this.commerceFlow.releaseBookingCalendarOccupancy(tenantId, oldId);
    }

    const resolved = await this.resolveOrCreateGuest.executeForBookingCreate(
      {
        tenantId,
        contact: {
          displayName: row.guestName,
          email: row.guestEmail,
          phone: row.guestPhone,
        },
      },
      actor,
    );
    if (resolved.isFailure) {
      throw resolved.getError();
    }
    booking.linkGuest(resolved.getValue().guest.id);

    // Persist successor X (hold + quote + booking + active calendar + outbox).
    await this.commerceFlow.saveImportReservation(hold, quote, booking);

    // Only AFTER X exists: supersede A…N → X (FK is immediate).
    const supersededIds: string[] = [];
    for (const oldId of replaceIds) {
      const old = await this.bookings.findById(oldId, tenantId);
      if (!old) {
        throw new ConflictError(
          `Import commit blocked: replace target ${oldId} disappeared during commit`,
        );
      }
      old.supersedeForImport({
        supersededByBookingId: bookingId,
        reason: csvImportSupersedeReason(),
        at: now,
        mutationOrigin: origin,
      });
      await this.bookings.save(old);
      // Idempotent release (already released above).
      await this.commerceFlow.releaseBookingCalendarOccupancy(tenantId, oldId);
      supersededIds.push(oldId);
    }

    const payload = {
      ...(row.payload ?? {}),
      ...(supersededIds.length > 0
        ? { supersededBookingIds: supersededIds }
        : {}),
    };

    await this.imports.updateRow(
      row.id,
      tenantId,
      {
        status: "imported",
        createdBookingId: bookingId,
        supersededBookingId: supersededIds[0] ?? null,
        processedAt: now,
        payload,
        errorCode: null,
        errorMessage: null,
      },
      now,
    );

    return { bookingId, supersededIds };
  }
}
