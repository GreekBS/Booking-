import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type {
  IChannelConnectionProviderSetupRepository,
  IChannelInitialSyncPreviewRepository,
} from "../ports/IChannelProductMappingRepository";
import type { RequestBookingComAriPropagationUseCase } from "./RequestBookingComAriPropagationUseCase";
import type { BookingComAriResolvedProjection } from "../providers/booking_com/ari/BookingComAriProjection";
import {
  BOOKING_COM_MAPPING_EVENTS,
  emitBookingComMappingEvent,
  type BookingComMappingLogFn,
} from "../providers/booking_com/sync/bookingComAriDiff";
import {
  parseBookingComConnectionSetup,
} from "../providers/booking_com/setup/BookingComConnectionSetup";

export interface ConfirmBookingComInitialSyncCommand {
  tenantId: string;
  connectionId: string;
  confirmationToken: string;
  /** Current fingerprints must match preview or confirmation fails. */
  mappingConfigGeneration: number;
  talosStateFingerprint: string;
  remoteSnapshotFingerprint: string;
  /** Must match the previewed synchronization horizon. */
  from: string;
  to: string;
  /** Projections to enqueue via CM-4c-3 after confirmation. */
  projectionsToEnqueue: readonly BookingComAriResolvedProjection[];
}

export interface ConfirmBookingComInitialSyncResult {
  previewId: string;
  enqueued: number;
  suppressed: number;
  rejected: number;
}

/**
 * Explicit confirmation: token + generation/fingerprint CAS.
 * Then durable enqueue through RequestBookingComAriPropagationUseCase (no sync HTTP).
 */
export class ConfirmBookingComInitialSyncUseCase {
  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly setups: IChannelConnectionProviderSetupRepository,
    private readonly previews: IChannelInitialSyncPreviewRepository,
    private readonly requestAriPropagation: RequestBookingComAriPropagationUseCase,
    private readonly log: BookingComMappingLogFn = () => {},
  ) {}

  async execute(
    command: ConfirmBookingComInitialSyncCommand,
  ): Promise<Result<ConfirmBookingComInitialSyncResult, Error>> {
    try {
      const connection = await this.connections.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection || connection.provider !== "booking_com") {
        return Result.fail(new ValidationError("Booking.com connection required"));
      }

      const preview = await this.previews.findPendingByToken(
        command.tenantId,
        command.connectionId,
        command.confirmationToken,
      );
      if (!preview) {
        return Result.fail(
          new ValidationError("Initial sync confirmation token is invalid or expired"),
        );
      }

      if (preview.mappingConfigGeneration !== command.mappingConfigGeneration) {
        return Result.fail(
          new ValidationError("Stale preview: mapping configuration changed"),
        );
      }
      if (preview.talosStateFingerprint !== command.talosStateFingerprint) {
        return Result.fail(
          new ValidationError("Stale preview: Talos ARI state changed"),
        );
      }
      if (preview.remoteSnapshotFingerprint !== command.remoteSnapshotFingerprint) {
        return Result.fail(
          new ValidationError("Stale preview: remote ARI snapshot changed"),
        );
      }

      const previewFrom =
        typeof preview.summary.from === "string" ? preview.summary.from : null;
      const previewTo =
        typeof preview.summary.to === "string" ? preview.summary.to : null;
      if (
        !previewFrom ||
        !previewTo ||
        previewFrom !== command.from ||
        previewTo !== command.to
      ) {
        return Result.fail(
          new ValidationError("Stale preview: synchronization horizon changed"),
        );
      }
      for (const projection of command.projectionsToEnqueue) {
        if (projection.from !== command.from || projection.to !== command.to) {
          return Result.fail(
            new ValidationError(
              "Projection horizon does not match confirmation horizon",
            ),
          );
        }
      }

      const setupRecord = await this.setups.get(
        command.tenantId,
        command.connectionId,
      );
      if (
        !setupRecord ||
        setupRecord.mappingConfigGeneration !== preview.mappingConfigGeneration
      ) {
        return Result.fail(
          new ValidationError("Stale preview: mapping configuration changed"),
        );
      }

      let enqueued = 0;
      let suppressed = 0;
      let rejected = 0;
      const setup = parseBookingComConnectionSetup(setupRecord.setup);

      for (const projection of command.projectionsToEnqueue) {
        const scheduled = await this.requestAriPropagation.execute({
          projection,
          connectionSetup: setup,
          allowPendingAuth: true,
        });
        if (scheduled.isFailure) {
          rejected += 1;
          continue;
        }
        const outcome = scheduled.getValue().outcome;
        if (outcome === "scheduled") enqueued += 1;
        else if (outcome === "suppressed_loop") suppressed += 1;
        else rejected += 1;
      }

      // Fail closed: do not consume the preview token when every requested
      // projection was rejected (operator must fix mapping/connection and re-preview).
      // Empty projection lists (no ARI delta) and loop-suppressed-only batches remain valid.
      if (
        command.projectionsToEnqueue.length > 0 &&
        enqueued === 0 &&
        suppressed === 0 &&
        rejected === command.projectionsToEnqueue.length
      ) {
        return Result.fail(
          new ValidationError(
            "Initial sync confirmation could not enqueue any ARI work; preview not consumed",
          ),
        );
      }

      await this.previews.markConfirmed({
        tenantId: command.tenantId,
        previewId: preview.id,
        confirmedAt: new Date(),
      });

      await this.setups.upsert({
        ...setupRecord,
        setup: {
          ...setup,
          mappingReady: true,
          initialSyncReady: true,
          setupProgress: "ready_to_activate",
        },
        updatedAt: new Date(),
      });

      emitBookingComMappingEvent(
        this.log,
        BOOKING_COM_MAPPING_EVENTS.INITIAL_SYNC_ENQUEUED,
        {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          previewId: preview.id,
          enqueued,
          suppressed,
          rejected,
        },
      );

      return Result.ok({
        previewId: preview.id,
        enqueued,
        suppressed,
        rejected,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
