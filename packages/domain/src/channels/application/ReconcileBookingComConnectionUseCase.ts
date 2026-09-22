import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type {
  ChannelReconciliationOutcomeCode,
  IChannelConnectionProviderSetupRepository,
  IChannelProductMappingRepository,
  IChannelReconciliationRunRepository,
} from "../ports/IChannelProductMappingRepository";
import type { ReceiveChannelEventUseCase } from "./ReceiveChannelEventUseCase";
import type { RequestBookingComAriPropagationUseCase } from "./RequestBookingComAriPropagationUseCase";
import type { BookingComSummaryRecoveryUseCase } from "../providers/booking_com/recovery/BookingComSummaryRecoveryUseCase";
import type { IBookingComRemoteDiscoveryClient } from "../providers/booking_com/discovery/IBookingComRemoteDiscoveryClient";
import type { IBookingComRemoteAriReader } from "../providers/booking_com/sync/IBookingComRemoteAriReader";
import {
  BOOKING_COM_MAPPING_EVENTS,
  diffBookingComAriState,
  emitBookingComMappingEvent,
  type BookingComAriDiffCell,
  type BookingComMappingLogFn,
} from "../providers/booking_com/sync/bookingComAriDiff";
import {
  parseBookingComConnectionSetup,
} from "../providers/booking_com/setup/BookingComConnectionSetup";
import type { BookingComAriResolvedProjection } from "../providers/booking_com/ari/BookingComAriProjection";
import { shouldSuppressChannelOutboundEcho } from "./channelOutboundLoopSuppression";
import { validateBookingComMappings } from "../providers/booking_com/mapping/validateBookingComMappings";

export interface ReconcileBookingComConnectionCommand {
  tenantId: string;
  connectionId: string;
  from: string;
  to: string;
  activeUnitIds: readonly string[];
  activeRatePlanIds: readonly string[];
  unitPropertyIds: ReadonlyMap<string, string>;
  localCells: readonly BookingComAriDiffCell[];
  /** Optional ARI projections to auto-heal LOCAL_AHEAD / safe REMOTE_DRIFT. */
  healProjections?: readonly BookingComAriResolvedProjection[];
  /** When inventory originated from booking_com, suppress ARI auto-heal echo. */
  inboundOriginProvider?: string | null;
  runReservationRecovery?: boolean;
}

export interface ReconcileBookingComConnectionResult {
  outcomes: readonly {
    scope: "reservations" | "ari" | "mappings";
    outcome: ChannelReconciliationOutcomeCode;
    autoHealEnqueued: boolean;
  }[];
}

/**
 * Reconciliation foundation: reservations→Receive, ARI→CM-4c-3, mapping drift never auto-heals.
 */
export class ReconcileBookingComConnectionUseCase {
  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly setups: IChannelConnectionProviderSetupRepository,
    private readonly mappings: IChannelProductMappingRepository,
    private readonly runs: IChannelReconciliationRunRepository,
    private readonly discovery: IBookingComRemoteDiscoveryClient,
    private readonly remoteAri: IBookingComRemoteAriReader,
    private readonly summaryRecovery: BookingComSummaryRecoveryUseCase | null,
    private readonly requestAri: RequestBookingComAriPropagationUseCase,
    private readonly idGenerator: IIdGenerator,
    private readonly log: BookingComMappingLogFn = () => {},
    /** Receive is available for tests that inject recovery path explicitly. */
    private readonly _receive?: ReceiveChannelEventUseCase,
  ) {
    void this._receive;
  }

  async execute(
    command: ReconcileBookingComConnectionCommand,
  ): Promise<Result<ReconcileBookingComConnectionResult, Error>> {
    try {
      const connection = await this.connections.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection || connection.provider !== "booking_com") {
        return Result.fail(new ValidationError("Booking.com connection required"));
      }
      if (connection.status === "paused" || connection.status === "disconnected") {
        const outcome: ChannelReconciliationOutcomeCode = "PROVIDER_UNAVAILABLE";
        await this.persistRun(command, "mappings", outcome, false, {
          reason: connection.status,
        });
        return Result.ok({
          outcomes: [{ scope: "mappings", outcome, autoHealEnqueued: false }],
        });
      }

      const setupRecord = await this.setups.get(
        command.tenantId,
        command.connectionId,
      );
      const setup = setupRecord
        ? parseBookingComConnectionSetup(setupRecord.setup)
        : null;
      const mappingList = await this.mappings.listByConnection(
        command.tenantId,
        command.connectionId,
      );

      const outcomes: ReconcileBookingComConnectionResult["outcomes"][number][] =
        [];

      // --- Mappings ---
      let discoverySnap = null;
      try {
        if (setup?.hotelId) {
          discoverySnap = await this.discovery.discover(setup.hotelId);
        }
      } catch {
        const outcome: ChannelReconciliationOutcomeCode = "PROVIDER_UNAVAILABLE";
        await this.persistRun(command, "mappings", outcome, false, {});
        outcomes.push({
          scope: "mappings",
          outcome,
          autoHealEnqueued: false,
        });
        return Result.ok({ outcomes });
      }

      const validation = validateBookingComMappings({
        mappings: mappingList,
        expectedPropertyId: null,
        activeUnitIds: new Set(command.activeUnitIds),
        activeRatePlanIds: new Set(command.activeRatePlanIds),
        unitPropertyIds: command.unitPropertyIds,
        pricingModel: setup?.pricingModel ?? "Standard",
        expectedMappingConfigGeneration:
          setupRecord?.mappingConfigGeneration ?? null,
        discovery: discoverySnap,
      });

      let mappingOutcome: ChannelReconciliationOutcomeCode = "IN_SYNC";
      if (!validation.ok) {
        mappingOutcome = validation.blocking.some(
          (b) => b.code === "DUPLICATE_REMOTE_MAPPING",
        )
          ? "REQUIRES_OPERATOR_ATTENTION"
          : "BLOCKED_MAPPING";
      } else if (validation.warnings.length > 0) {
        mappingOutcome = "MAPPING_DRIFT";
        emitBookingComMappingEvent(this.log, BOOKING_COM_MAPPING_EVENTS.MAPPING_DRIFT, {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          warningCount: validation.warnings.length,
        });
      }
      // Mapping ambiguity / drift NEVER auto-heals.
      await this.persistRun(command, "mappings", mappingOutcome, false, {
        blocking: validation.blocking.map((b) => b.code),
        warnings: validation.warnings.map((w) => w.code),
      });
      outcomes.push({
        scope: "mappings",
        outcome: mappingOutcome,
        autoHealEnqueued: false,
      });

      // --- Reservations (summary recovery → Receive only) ---
      let reservationOutcome: ChannelReconciliationOutcomeCode = "IN_SYNC";
      let reservationHeal = false;
      if (command.runReservationRecovery && this.summaryRecovery && setup?.hotelId) {
        const recovered = await this.summaryRecovery.execute({
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          hotelId: setup.hotelId,
          fallbackHotelId: setup.hotelId,
        });
        if (recovered.isFailure) {
          reservationOutcome = "PROVIDER_UNAVAILABLE";
        } else {
          const value = recovered.getValue();
          if (value.ingested > 0) {
            reservationOutcome = "MISSING_RESERVATION";
            reservationHeal = true;
          } else if (value.failed > 0) {
            reservationOutcome = "REQUIRES_OPERATOR_ATTENTION";
          }
        }
      }
      await this.persistRun(
        command,
        "reservations",
        reservationOutcome,
        reservationHeal,
        {},
      );
      outcomes.push({
        scope: "reservations",
        outcome: reservationOutcome,
        autoHealEnqueued: reservationHeal,
      });

      // --- ARI ---
      if (!setup?.hotelId) {
        const outcome: ChannelReconciliationOutcomeCode = "BLOCKED_MAPPING";
        await this.persistRun(command, "ari", outcome, false, {});
        outcomes.push({ scope: "ari", outcome, autoHealEnqueued: false });
        return Result.ok({ outcomes });
      }

      const remote = await this.remoteAri.read({
        hotelId: setup.hotelId,
        from: command.from,
        to: command.to,
      });
      const diff = diffBookingComAriState({
        from: command.from,
        to: command.to,
        local: command.localCells.map((c) => ({ ...c, remote: null })),
        remote: remote.cells.map((c) => ({
          hotelId: c.hotelId,
          roomTypeId: c.roomTypeId,
          ratePlanId: c.ratePlanId,
          date: c.date,
          field: c.field,
          local: null,
          remote: c.value,
        })),
      });

      let ariOutcome: ChannelReconciliationOutcomeCode = "IN_SYNC";
      let ariHeal = false;
      const changeCount =
        diff.availabilityChanges +
        diff.priceChanges +
        diff.minStayChanges +
        diff.maxStayChanges +
        diff.ctaChanges +
        diff.ctdChanges;

      if (changeCount > 0) {
        ariOutcome = diff.opens + diff.closes + diff.availabilityChanges > 0
          ? "REMOTE_DRIFT"
          : "LOCAL_AHEAD";
        emitBookingComMappingEvent(
          this.log,
          BOOKING_COM_MAPPING_EVENTS.RECONCILIATION_DRIFT,
          {
            tenantId: command.tenantId,
            connectionId: command.connectionId,
            roomsAffected: diff.roomsAffected,
            availabilityChanges: diff.availabilityChanges,
            priceChanges: diff.priceChanges,
          },
        );

        const suppress = shouldSuppressChannelOutboundEcho({
          outboundProvider: "booking_com",
          inboundOriginProvider: command.inboundOriginProvider as never,
        });

        if (
          !suppress &&
          mappingOutcome === "IN_SYNC" &&
          command.healProjections &&
          command.healProjections.length > 0
        ) {
          for (const projection of command.healProjections) {
            const scheduled = await this.requestAri.execute({
              projection,
              connectionSetup: setup,
            });
            if (scheduled.isSuccess && scheduled.getValue().outcome === "scheduled") {
              ariHeal = true;
            }
          }
        }
      }

      await this.persistRun(command, "ari", ariOutcome, ariHeal, {
        fingerprint: diff.fingerprint,
      });
      outcomes.push({
        scope: "ari",
        outcome: ariOutcome,
        autoHealEnqueued: ariHeal,
      });

      emitBookingComMappingEvent(
        this.log,
        BOOKING_COM_MAPPING_EVENTS.RECONCILIATION_COMPLETED,
        {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          outcomes: outcomes.map((o) => o.outcome),
        },
      );

      return Result.ok({ outcomes });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async persistRun(
    command: ReconcileBookingComConnectionCommand,
    scope: "reservations" | "ari" | "mappings",
    outcome: ChannelReconciliationOutcomeCode,
    autoHealEnqueued: boolean,
    details: Record<string, unknown>,
  ): Promise<void> {
    const setup = await this.setups.get(command.tenantId, command.connectionId);
    await this.runs.save({
      id: this.idGenerator.generate(),
      tenantId: command.tenantId,
      connectionId: command.connectionId,
      scope,
      outcome,
      mappingConfigGeneration: setup?.mappingConfigGeneration ?? 0,
      autoHealEnqueued,
      details,
      completedAt: new Date(),
    });
  }
}
