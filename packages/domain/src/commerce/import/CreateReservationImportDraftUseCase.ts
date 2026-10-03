import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ActorContext } from "../../shared/services/PermissionChecker";
import { PermissionChecker } from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { PERMISSIONS } from "@hcp/permissions";
import type {
  IAvailabilityRulesRepository,
  ICalendarBlockRepository,
  ICatalogQueryPort,
  ITimezoneService,
} from "../ports/CommercePorts";
import { StayAvailabilityEngine } from "../reservation/engines/StayAvailabilityEngine";
import {
  CSV_RESERVATION_IMPORT_NAMESPACE,
  type ReservationImportBatchRecord,
  type ReservationImportMissingPriceStrategy,
  type ReservationImportRowRecord,
} from "./ReservationImportTypes";
import type { IReservationImportRepository } from "./IReservationImportRepository";
import {
  parseAndValidateCsvImport,
  resolveCsvImportUnitRefs,
  type CsvImportCanonicalField,
  type CsvImportDateFormat,
  type CsvImportDelimiter,
  type CsvImportIssue,
  type ICsvImportUnitResolver,
} from "./csv";
import { classifyImportStayTemporalClass } from "./ImportStayTemporalClass";
import { importAvailabilityPolicyForTemporalClass } from "./ImportAvailabilityPolicy";
import {
  assignConflictGroupIds,
  emptyConflictSnapshot,
  nodeKey,
  type ReservationImportConflictNode,
  type ReservationImportConflictSnapshot,
} from "./ReservationImportConflictGraph";
import { StayPeriod } from "../shared/value-objects/StayPeriod";

export interface ReservationImportPricingPort {
  previewTotal(input: {
    tenantId: string;
    unitId: string;
    checkIn: string;
    checkOut: string;
  }): Promise<{ amount: string; currency: string } | null>;
}

export interface CreateReservationImportDraftCommand {
  tenantId: string;
  filename: string;
  content: Uint8Array | string;
  byteSize?: number;
  delimiter?: CsvImportDelimiter;
  dateFormat?: CsvImportDateFormat;
  columnMapping?: Record<string, CsvImportCanonicalField | null>;
  missingPriceStrategy?: ReservationImportMissingPriceStrategy;
  now?: Date;
}

export interface CreateReservationImportDraftResult {
  batch: ReservationImportBatchRecord;
  rows: ReservationImportRowRecord[];
  unpersisted: Array<{
    rowNumber: number;
    errors: CsvImportIssue[];
    warnings: CsvImportIssue[];
  }>;
  parseIssues: CsvImportIssue[];
}

export class CreateReservationImportDraftUseCase {
  private readonly availability: StayAvailabilityEngine;

  constructor(
    private readonly imports: IReservationImportRepository,
    private readonly unitResolver: ICsvImportUnitResolver,
    private readonly catalog: ICatalogQueryPort,
    private readonly calendarBlocks: ICalendarBlockRepository,
    availabilityRules: IAvailabilityRulesRepository,
    private readonly timezoneService: ITimezoneService,
    private readonly pricing: ReservationImportPricingPort,
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
    command: CreateReservationImportDraftCommand,
    actor: ActorContext,
  ): Promise<Result<CreateReservationImportDraftResult, Error>> {
    try {
      this.permissionChecker.assertPermission(
        actor,
        PERMISSIONS.BOOKING_CREATE_TENANT,
        command.tenantId,
      );

      const now = command.now ?? new Date();
      const unitRefsProbe = parseAndValidateCsvImport({
        content: command.content,
        delimiter: command.delimiter,
        dateFormat: command.dateFormat,
        columnMapping: command.columnMapping,
      });

      if (unitRefsProbe.rows.length === 0 && unitRefsProbe.issues.some((i) => i.severity === "error")) {
        return Result.fail(
          new ValidationError(
            unitRefsProbe.issues.find((i) => i.severity === "error")?.message ??
              "CSV could not be parsed",
          ),
        );
      }

      const resolutions = await resolveCsvImportUnitRefs(
        this.unitResolver,
        command.tenantId,
        unitRefsProbe.rows.map((r) => r.unitRef).filter((v): v is string => Boolean(v)),
      );

      const parsed = parseAndValidateCsvImport({
        content: command.content,
        delimiter: command.delimiter,
        dateFormat: command.dateFormat,
        columnMapping: command.columnMapping,
        unitResolutions: resolutions,
      });

      const batchId = this.idGenerator.generate();
      const batch = await this.imports.createBatch({
        id: batchId,
        tenantId: command.tenantId,
        actorId: actor.userId,
        filename: command.filename,
        byteSize: command.byteSize ?? null,
        missingPriceStrategy: command.missingPriceStrategy ?? "undecided",
        now,
      });

      const unpersisted: CreateReservationImportDraftResult["unpersisted"] = [];
      const createInputs: Parameters<IReservationImportRepository["createRows"]>[0] = [];

      for (const row of parsed.rows) {
        if (
          !row.unitId ||
          !row.checkIn ||
          !row.checkOut ||
          !row.externalReference ||
          !row.guestName ||
          !row.guestEmail ||
          row.guestCount == null
        ) {
          unpersisted.push({
            rowNumber: row.rowNumber,
            errors: row.errors,
            warnings: row.warnings,
          });
          continue;
        }

        const unit = await this.catalog.getUnit(row.unitId, command.tenantId);
        if (!unit) {
          unpersisted.push({
            rowNumber: row.rowNumber,
            errors: [
              ...row.errors,
              {
                code: "UNIT_NOT_FOUND",
                severity: "error",
                message: "Unit not found",
                rowNumber: row.rowNumber,
                field: "unitRef",
              },
            ],
            warnings: row.warnings,
          });
          continue;
        }
        const property = await this.catalog.getProperty(unit.propertyId, command.tenantId);
        if (!property) {
          unpersisted.push({
            rowNumber: row.rowNumber,
            errors: row.errors,
            warnings: row.warnings,
          });
          continue;
        }
        const today = await this.timezoneService.propertyLocalToday(property.timezone);
        const temporalClass =
          row.temporalClass ??
          classifyImportStayTemporalClass(row.checkIn, row.checkOut, today);

        createInputs.push({
          id: this.idGenerator.generate(),
          tenantId: command.tenantId,
          batchId,
          rowNumber: row.rowNumber,
          externalReference: row.externalReference,
          unitId: row.unitId,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
          temporalClass,
          guestName: row.guestName,
          guestEmail: row.guestEmail,
          guestPhone: row.guestPhone,
          guestCount: row.guestCount,
          priceSource: row.price.status === "present" ? "imported_csv" : "unresolved",
          importedTotalAmount:
            row.price.status === "present" ? row.price.amount : null,
          importedCurrency:
            row.price.status === "present" ? row.price.currency : null,
          status: "pending",
          replaceBookingIds: [],
          payload: {
            unitRef: row.unitRef,
            channelSource: row.channelSource,
            notes: row.notes,
            raw: row.raw,
            parseErrors: row.errors,
            parseWarnings: row.warnings,
          },
          conflictSnapshot: emptyConflictSnapshot() as unknown as Record<string, unknown>,
        });
      }

      let rows =
        createInputs.length > 0 ? await this.imports.createRows(createInputs) : [];
      await this.imports.updateBatch(
        batchId,
        command.tenantId,
        { rowCount: rows.length },
        now,
      );

      rows = await this.preflightRows({
        tenantId: command.tenantId,
        rows,
        missingPriceStrategy: batch.missingPriceStrategy,
        now,
      });

      const refreshed = await this.imports.findBatchById(batchId, command.tenantId);
      return Result.ok({
        batch: refreshed!,
        rows,
        unpersisted,
        parseIssues: parsed.issues,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Public for recheck use case. */
  async preflightRows(input: {
    tenantId: string;
    rows: ReservationImportRowRecord[];
    missingPriceStrategy: ReservationImportMissingPriceStrategy;
    now: Date;
  }): Promise<ReservationImportRowRecord[]> {
    const { tenantId, missingPriceStrategy, now } = input;
    const rows = [...input.rows];
    const bookingNodes = new Map<string, ReservationImportConflictNode>();
    const importNodes: ReservationImportConflictNode[] = rows.map((row) => ({
      kind: "import_row",
      id: row.id,
      unitId: row.unitId,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
    }));

    for (const row of rows) {
      const snapshot = emptyConflictSnapshot();
      let status = row.status;
      let errorCode: string | null = null;
      let errorMessage: string | null = null;
      let priceSource = row.priceSource;
      let operatorTotalAmount = row.operatorTotalAmount;
      let operatorCurrency = row.operatorCurrency;

      const durable = await this.imports.findDurableByExternalReference({
        tenantId,
        sourceNamespace: CSV_RESERVATION_IMPORT_NAMESPACE,
        externalReference: row.externalReference,
      });
      if (durable && durable.id !== row.id && durable.batchId !== row.batchId) {
        // Preflight advisory only — do NOT write skipped_already_imported here
        // (that status is durable and protected by the partial unique index).
        status = "skipped";
        errorCode = "ALREADY_IMPORTED";
        errorMessage = `External reference already imported: ${row.externalReference}`;
      }

      if (
        status !== "skipped" &&
        status !== "skipped_already_imported" &&
        priceSource === "unresolved" &&
        missingPriceStrategy === "talos_for_all_missing"
      ) {
        const priced = await this.pricing.previewTotal({
          tenantId,
          unitId: row.unitId,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
        });
        if (priced) {
          priceSource = "talos_calculated";
          operatorTotalAmount = priced.amount;
          operatorCurrency = priced.currency;
        } else {
          errorCode = "TALOS_PRICE_UNAVAILABLE";
          errorMessage = "TALOS could not calculate a price for this stay";
        }
      }

      if (status !== "skipped" && status !== "skipped_already_imported") {
        const availabilityResult = await this.availability.evaluate({
          tenantId,
          unitId: row.unitId,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
          guestCount: row.guestCount,
          policy: importAvailabilityPolicyForTemporalClass(row.temporalClass),
        });
        if (availabilityResult.isSuccess) {
          const evalResult = availabilityResult.getValue();
          const nonBlockReasons = evalResult.reasons.filter(
            (r) => r.code !== "DATES_BLOCKED" && r.code !== "TURNOVER_BUFFER",
          );
          if (nonBlockReasons.length > 0) {
            errorCode = nonBlockReasons[0]!.code;
            errorMessage = nonBlockReasons[0]!.message;
          }
          if (evalResult.warnings.length > 0) {
            const payload = { ...(row.payload ?? {}) };
            payload.availabilityWarnings = evalResult.warnings;
            Object.assign(row, { payload });
          }
        }

        const blocks = await this.calendarBlocks.findActiveBlocks(row.unitId, tenantId);
        const stay = StayPeriod.create(row.checkIn, row.checkOut);
        for (const block of blocks) {
          if (block.status !== "active") continue;
          const blockPeriod = StayPeriod.create(block.checkIn, block.checkOut);
          if (!stay.overlaps(blockPeriod)) continue;
          if (block.blockType === "booking" && block.sourceId) {
            snapshot.existingBookingIds.push(block.sourceId);
            snapshot.overlaps.push({
              otherKind: "existing_booking",
              otherId: block.sourceId,
              checkIn: block.checkIn,
              checkOut: block.checkOut,
            });
            bookingNodes.set(block.sourceId, {
              kind: "existing_booking",
              id: block.sourceId,
              unitId: row.unitId,
              checkIn: block.checkIn,
              checkOut: block.checkOut,
            });
          } else if (
            block.blockType === "manual" ||
            block.blockType === "maintenance" ||
            block.blockType === "cleaning" ||
            block.blockType === "owner"
          ) {
            snapshot.nonBookingBlockers.push({
              blockType: block.blockType,
              sourceId: block.sourceId,
              checkIn: block.checkIn,
              checkOut: block.checkOut,
              message: `Dates overlap with ${block.blockType} block`,
            });
          }
        }
        snapshot.existingBookingIds = [...new Set(snapshot.existingBookingIds)];
      }

      Object.assign(row, {
        status,
        errorCode,
        errorMessage,
        priceSource,
        operatorTotalAmount,
        operatorCurrency,
        conflictSnapshot: snapshot as unknown as Record<string, unknown>,
      });
    }

    for (let i = 0; i < importNodes.length; i++) {
      for (let j = i + 1; j < importNodes.length; j++) {
        const a = importNodes[i]!;
        const b = importNodes[j]!;
        if (a.unitId !== b.unitId) continue;
        if (
          !StayPeriod.create(a.checkIn, a.checkOut).overlaps(
            StayPeriod.create(b.checkIn, b.checkOut),
          )
        ) {
          continue;
        }
        const rowA = rows.find((r) => r.id === a.id)!;
        const rowB = rows.find((r) => r.id === b.id)!;
        const snapA = rowA.conflictSnapshot as unknown as ReservationImportConflictSnapshot;
        const snapB = rowB.conflictSnapshot as unknown as ReservationImportConflictSnapshot;
        snapA.peerImportRowIds.push(b.id);
        snapB.peerImportRowIds.push(a.id);
        snapA.overlaps.push({
          otherKind: "import_row",
          otherId: b.id,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
        });
        snapB.overlaps.push({
          otherKind: "import_row",
          otherId: a.id,
          checkIn: a.checkIn,
          checkOut: a.checkOut,
        });
      }
    }

    const groups = assignConflictGroupIds([
      ...importNodes,
      ...bookingNodes.values(),
    ]);

    const out: ReservationImportRowRecord[] = [];
    for (const row of rows) {
      const snapshot = row.conflictSnapshot as unknown as ReservationImportConflictSnapshot;
      snapshot.peerImportRowIds = [...new Set(snapshot.peerImportRowIds)];
      const groupId = groups.get(nodeKey("import_row", row.id)) ?? null;

      let status = row.status;
      let errorCode = row.errorCode;
      let errorMessage = row.errorMessage;

      if (status !== "skipped" && status !== "skipped_already_imported") {
        const priceResolved =
          row.priceSource === "imported_csv" ||
          row.priceSource === "talos_calculated" ||
          row.priceSource === "operator_entered";
        const bookingConflictsResolved =
          snapshot.existingBookingIds.length === 0 ||
          row.conflictResolution === "keep_existing" ||
          (row.conflictResolution === "keep_csv" &&
            snapshot.existingBookingIds.every((id) =>
              (row.replaceBookingIds ?? []).includes(id),
            ));
        const peerConflictsResolved =
          snapshot.peerImportRowIds.length === 0 ||
          row.conflictResolution === "keep_existing" ||
          row.conflictResolution === "keep_csv";

        if (snapshot.nonBookingBlockers.length > 0) {
          status = "failed";
          errorCode = `BLOCKED_BY_${snapshot.nonBookingBlockers[0]!.blockType.toUpperCase()}`;
          errorMessage = snapshot.nonBookingBlockers[0]!.message;
        } else if (row.conflictResolution === "keep_existing") {
          status = "skipped";
          errorCode = "KEEP_EXISTING";
          errorMessage = "Operator chose to keep existing occupancy";
        } else if (
          bookingConflictsResolved &&
          peerConflictsResolved &&
          priceResolved &&
          !errorCode
        ) {
          status = "ready";
          errorCode = null;
          errorMessage = null;
        } else {
          status = "pending";
        }
      }

      out.push(
        await this.imports.updateRow(
          row.id,
          tenantId,
          {
            status,
            errorCode,
            errorMessage,
            priceSource: row.priceSource,
            operatorTotalAmount: row.operatorTotalAmount,
            operatorCurrency: row.operatorCurrency,
            conflictSnapshot: snapshot as unknown as Record<string, unknown>,
            conflictGroupId: groupId,
            recheckRequired: false,
            replaceBookingIds: row.replaceBookingIds ?? [],
            replaceBookingId: row.replaceBookingId,
            conflictResolution: row.conflictResolution,
          },
          now,
        ),
      );
    }
    return out;
  }
}
