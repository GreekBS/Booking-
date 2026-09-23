import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type {
  IChannelConnectionProviderSetupRepository,
  IChannelInitialSyncPreviewRepository,
  IChannelProductMappingRepository,
} from "../ports/IChannelProductMappingRepository";
import { ValidateBookingComMappingsUseCase } from "./ValidateBookingComMappingsUseCase";
import type { IBookingComRemoteAriReader } from "../providers/booking_com/sync/IBookingComRemoteAriReader";
import {
  BOOKING_COM_MAPPING_EVENTS,
  buildInitialSyncConfirmationToken,
  diffBookingComAriState,
  emitBookingComMappingEvent,
  type BookingComAriDiffCell,
  type BookingComAriDiffSummary,
  type BookingComMappingLogFn,
} from "../providers/booking_com/sync/bookingComAriDiff";
import {
  parseBookingComConnectionSetup,
} from "../providers/booking_com/setup/BookingComConnectionSetup";
import { sha256HexUtf8 } from "../utils/sha256Hex";

export interface GenerateBookingComInitialSyncPreviewCommand {
  tenantId: string;
  connectionId: string;
  from: string;
  to: string;
  expectedPropertyId?: string | null;
  activeUnitIds: readonly string[];
  activeRatePlanIds: readonly string[];
  unitPropertyIds: ReadonlyMap<string, string>;
  /** Authoritative Talos-resolved ARI cells for the horizon. */
  localCells: readonly BookingComAriDiffCell[];
  talosStateFingerprint: string;
}

export interface GenerateBookingComInitialSyncPreviewResult {
  previewId: string;
  confirmationToken: string;
  mappingConfigGeneration: number;
  talosStateFingerprint: string;
  remoteSnapshotFingerprint: string;
  diff: BookingComAriDiffSummary;
  blockingIssueCount: number;
  warningIssueCount: number;
}

/**
 * Read remote → diff vs Talos → persist preview. Never pushes.
 */
export class GenerateBookingComInitialSyncPreviewUseCase {
  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly setups: IChannelConnectionProviderSetupRepository,
    private readonly mappings: IChannelProductMappingRepository,
    private readonly previews: IChannelInitialSyncPreviewRepository,
    private readonly remoteAri: IBookingComRemoteAriReader,
    private readonly validateMappings: ValidateBookingComMappingsUseCase,
    private readonly idGenerator: IIdGenerator,
    private readonly log: BookingComMappingLogFn = () => {},
  ) {}

  async execute(
    command: GenerateBookingComInitialSyncPreviewCommand,
  ): Promise<Result<GenerateBookingComInitialSyncPreviewResult, Error>> {
    try {
      const connection = await this.connections.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection || connection.provider !== "booking_com") {
        return Result.fail(new ValidationError("Booking.com connection required"));
      }
      if (connection.status === "disconnected") {
        return Result.fail(new ValidationError("Connection is disconnected"));
      }

      const validation = await this.validateMappings.execute({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        expectedPropertyId: command.expectedPropertyId,
        activeUnitIds: command.activeUnitIds,
        activeRatePlanIds: command.activeRatePlanIds,
        unitPropertyIds: command.unitPropertyIds,
        includeDiscovery: false,
      });
      if (validation.isFailure) return Result.fail(validation.getError());
      const validated = validation.getValue();
      if (!validated.ok) {
        return Result.fail(
          new ValidationError(
            `Mapping validation blocked preview: ${validated.blocking.map((b) => b.code).join(",")}`,
          ),
        );
      }

      const setupRecord = await this.setups.get(
        command.tenantId,
        command.connectionId,
      );
      if (!setupRecord) {
        return Result.fail(new ValidationError("Provider setup not found"));
      }
      const setup = parseBookingComConnectionSetup(setupRecord.setup);
      if (!setup.hotelId) {
        return Result.fail(new ValidationError("Hotel binding required for preview"));
      }

      const remote = await this.remoteAri.read({
        hotelId: setup.hotelId,
        from: command.from,
        to: command.to,
      });

      const remoteCells: BookingComAriDiffCell[] = remote.cells.map((c) => ({
        hotelId: c.hotelId,
        roomTypeId: c.roomTypeId,
        ratePlanId: c.ratePlanId,
        date: c.date,
        field: c.field,
        local: null,
        remote: c.value,
      }));

      const localCells: BookingComAriDiffCell[] = command.localCells.map((c) => ({
        ...c,
        remote: null,
      }));

      const diff = diffBookingComAriState({
        from: command.from,
        to: command.to,
        local: localCells,
        remote: remoteCells,
      });

      const confirmationToken = buildInitialSyncConfirmationToken({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        mappingConfigGeneration: setupRecord.mappingConfigGeneration,
        talosStateFingerprint: command.talosStateFingerprint,
        remoteSnapshotFingerprint: remote.fingerprint,
        diffFingerprint: diff.fingerprint,
      });

      const previewId = this.idGenerator.generate();
      await this.previews.supersedePending(
        command.tenantId,
        command.connectionId,
      );
      await this.previews.save({
        id: previewId,
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        confirmationToken,
        mappingConfigGeneration: setupRecord.mappingConfigGeneration,
        talosStateFingerprint: command.talosStateFingerprint,
        remoteSnapshotFingerprint: remote.fingerprint,
        summary: {
          diff,
          blockingIssueCount: validated.blocking.length,
          warningIssueCount: validated.warnings.length,
          warnings: validated.warnings,
          hotelId: setup.hotelId,
          from: command.from,
          to: command.to,
        },
        status: "pending",
        createdAt: new Date(),
        confirmedAt: null,
      });

      // Progress → sync_preview
      await this.setups.upsert({
        ...setupRecord,
        setup: {
          ...setup,
          setupProgress: "sync_preview",
          mappingReady: true,
        },
        updatedAt: new Date(),
      });

      emitBookingComMappingEvent(
        this.log,
        BOOKING_COM_MAPPING_EVENTS.INITIAL_SYNC_PREVIEW,
        {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          previewId,
          mappingConfigGeneration: setupRecord.mappingConfigGeneration,
          roomsAffected: diff.roomsAffected,
          availabilityChanges: diff.availabilityChanges,
          priceChanges: diff.priceChanges,
        },
      );

      return Result.ok({
        previewId,
        confirmationToken,
        mappingConfigGeneration: setupRecord.mappingConfigGeneration,
        talosStateFingerprint: command.talosStateFingerprint,
        remoteSnapshotFingerprint: remote.fingerprint,
        diff,
        blockingIssueCount: validated.blocking.length,
        warningIssueCount: validated.warnings.length,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export function fingerprintTalosAriCells(
  cells: readonly BookingComAriDiffCell[],
): string {
  return sha256HexUtf8(
    JSON.stringify(
      [...cells]
        .map((c) => ({
          k: `${c.hotelId}|${c.roomTypeId}|${c.ratePlanId ?? "-"}|${c.date}|${c.field}`,
          v: c.local,
        }))
        .sort((a, b) => a.k.localeCompare(b.k)),
    ),
  );
}
