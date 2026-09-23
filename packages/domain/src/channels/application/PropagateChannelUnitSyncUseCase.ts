import { Result } from "../../shared/kernel/Result";
import type { MutationOrigin } from "../../shared/types/MutationOrigin";
import type {
  ActiveCalendarBlock,
  RatePlanProps,
  UnitAvailabilityRulesProps,
} from "../../commerce/shared/types/CommerceTypes";
import type {
  IAvailabilityRulesRepository,
  ICalendarBlockRepository,
  IRatePlanRepository,
} from "../../commerce/ports/CommercePorts";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IChannelProductMappingRepository } from "../ports/IChannelProductMappingRepository";
import type { ChannelSource } from "../types/ChannelSource";
import type { ChannelUnitSyncChangeKind } from "../types/ChannelUnitSyncChange";
import { shouldSuppressChannelOutboundEcho } from "./channelOutboundLoopSuppression";
import type { RequestBookingComAriPropagationUseCase } from "./RequestBookingComAriPropagationUseCase";
import {
  projectAvailabilityDeltaToBookingCom,
  projectRateDeltaToBookingCom,
  projectRestrictionDeltaToBookingCom,
} from "../providers/booking_com/ari/bookingComAriDelta";
import type { BookingComAriResolvedProjection } from "../providers/booking_com/ari/BookingComAriProjection";
import { projectTalosUnitAriSnapshot } from "./talosUnitAriProjection";

export interface PropagateChannelUnitSyncCommand {
  tenantId: string;
  unitId: string;
  propertyId: string;
  from: string;
  to: string;
  changeKinds: readonly ChannelUnitSyncChangeKind[];
  mutationOrigin: MutationOrigin | null;
  revision: number;
  sourceEventId: string;
}

export interface PropagateChannelUnitSyncResult {
  considered: number;
  scheduled: number;
  suppressed: number;
  rejected: number;
}

/** Providers that support full ARI outbound. iCal is excluded. */
export function providerSupportsAriOutbound(provider: ChannelSource): boolean {
  return provider === "booking_com";
}

/**
 * Fan-out authoritative unit changes to eligible active channel connections.
 * Never calls provider HTTP — only durable RequestBookingComAriPropagation.
 */
export class PropagateChannelUnitSyncUseCase {
  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly listingMappings: IChannelListingMappingRepository,
    private readonly productMappings: IChannelProductMappingRepository | null,
    private readonly requestBookingComAri: RequestBookingComAriPropagationUseCase,
    private readonly calendarBlocks: ICalendarBlockRepository,
    private readonly ratePlans: IRatePlanRepository,
    private readonly availabilityRules: IAvailabilityRulesRepository,
  ) {}

  async execute(
    command: PropagateChannelUnitSyncCommand,
  ): Promise<Result<PropagateChannelUnitSyncResult, Error>> {
    try {
      const all = await this.connections.listByTenant(command.tenantId);
      let considered = 0;
      let scheduled = 0;
      let suppressed = 0;
      let rejected = 0;

      const blocks = await this.calendarBlocks.findActiveBlocks(
        command.unitId,
        command.tenantId,
      );
      const ratePlan = await this.ratePlans.findByUnitId(
        command.unitId,
        command.tenantId,
      );
      const rules = await this.availabilityRules.findByUnitId(
        command.unitId,
        command.tenantId,
      );

      for (const connection of all) {
        if (connection.status !== "active") continue;
        if (!providerSupportsAriOutbound(connection.provider as ChannelSource)) {
          continue;
        }
        considered += 1;

        if (
          shouldSuppressChannelOutboundEcho({
            outboundProvider: connection.provider as ChannelSource,
            outboundConnectionId: connection.id,
            mutationOrigin: command.mutationOrigin,
          })
        ) {
          suppressed += 1;
          continue;
        }

        const mappings = await this.listingMappings.listByConnection(
          command.tenantId,
          connection.id,
        );
        const unitMappings = mappings.filter(
          (m) => m.status === "active" && m.unitId === command.unitId,
        );
        if (unitMappings.length === 0) {
          rejected += 1;
          continue;
        }

        for (const mapping of unitMappings) {
          if (
            mapping.syncDirection === "inbound" ||
            !mapping.externalListingId ||
            !mapping.externalUnitId
          ) {
            rejected += 1;
            continue;
          }

          let ratePlanId: string | null = null;
          let mappingId = mapping.id;
          let mappingVersion = mapping.mappingVersion;

          if (this.productMappings) {
            const products = await this.productMappings.listByConnection(
              command.tenantId,
              connection.id,
            );
            const roomRate = products.find(
              (p) =>
                p.status === "active" &&
                p.kind === "room_rate" &&
                p.unitId === command.unitId &&
                p.externalRoomTypeId,
            );
            if (roomRate?.externalRatePlanId) {
              ratePlanId = roomRate.externalRatePlanId;
              mappingId = roomRate.id;
              mappingVersion = roomRate.mappingVersion;
            }
          }

          const inboundOrigin =
            command.mutationOrigin?.kind === "channel"
              ? (command.mutationOrigin.channel?.provider as ChannelSource)
              : null;

          const projections = buildProjections({
            command,
            connectionId: connection.id,
            hotelId: mapping.externalListingId,
            roomTypeId: mapping.externalUnitId,
            ratePlanId,
            mappingId,
            mappingVersion,
            blocks,
            ratePlan,
            rules,
            inboundOriginProvider: inboundOrigin,
            inboundOriginConnectionId:
              command.mutationOrigin?.kind === "channel"
                ? command.mutationOrigin.channel?.connectionId ?? null
                : null,
          });

          for (const projection of projections) {
            const result = await this.requestBookingComAri.execute({ projection });
            if (result.isFailure) {
              rejected += 1;
              continue;
            }
            const outcome = result.getValue().outcome;
            if (outcome === "scheduled") scheduled += 1;
            else if (outcome === "suppressed_loop") suppressed += 1;
            else rejected += 1;
          }
        }
      }

      return Result.ok({ considered, scheduled, suppressed, rejected });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function buildProjections(input: {
  command: PropagateChannelUnitSyncCommand;
  connectionId: string;
  hotelId: string;
  roomTypeId: string;
  ratePlanId: string | null;
  mappingId: string;
  mappingVersion: number;
  blocks: readonly ActiveCalendarBlock[];
  ratePlan: RatePlanProps | null;
  rules: UnitAvailabilityRulesProps | null;
  inboundOriginProvider: ChannelSource | null;
  inboundOriginConnectionId: string | null;
}): BookingComAriResolvedProjection[] {
  const { command } = input;
  const snapshot = projectTalosUnitAriSnapshot({
    hotelId: input.hotelId,
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId,
    from: command.from,
    to: command.to,
    activeBlocks: input.blocks,
    ratePlan: input.ratePlan,
    rules: input.rules,
    includePrices: command.changeKinds.includes("rates"),
  });

  const generation = command.revision;
  const projections: BookingComAriResolvedProjection[] = [];

  if (command.changeKinds.includes("availability") && snapshot.nights.length > 0) {
    const allSame = snapshot.nights.every(
      (n) =>
        n.roomsToSell === snapshot.nights[0]!.roomsToSell &&
        n.closed === snapshot.nights[0]!.closed,
    );
    if (allSame) {
      projections.push(
        projectAvailabilityDeltaToBookingCom({
          delta: {
            tenantId: command.tenantId,
            unitId: command.unitId,
            connectionId: input.connectionId,
            mappingId: input.mappingId,
            from: command.from,
            to: command.to,
            revision: generation,
            roomsToSell: snapshot.nights[0]!.roomsToSell,
            closed: snapshot.nights[0]!.closed,
          },
          hotelId: input.hotelId,
          roomTypeId: input.roomTypeId,
          mappingVersion: input.mappingVersion,
          generation,
          inboundOriginProvider: input.inboundOriginProvider,
          inboundOriginConnectionId: input.inboundOriginConnectionId,
        }),
      );
    } else {
      for (const night of snapshot.nights) {
        projections.push(
          projectAvailabilityDeltaToBookingCom({
            delta: {
              tenantId: command.tenantId,
              unitId: command.unitId,
              connectionId: input.connectionId,
              mappingId: input.mappingId,
              from: night.date,
              to: addOneDay(night.date),
              revision: generation,
              roomsToSell: night.roomsToSell,
              closed: night.closed,
            },
            hotelId: input.hotelId,
            roomTypeId: input.roomTypeId,
            mappingVersion: input.mappingVersion,
            generation,
            inboundOriginProvider: input.inboundOriginProvider,
            inboundOriginConnectionId: input.inboundOriginConnectionId,
          }),
        );
      }
    }
  }

  if (
    command.changeKinds.includes("rates") &&
    input.ratePlan &&
    input.ratePlanId &&
    snapshot.nights.some((n) => n.price != null)
  ) {
    projections.push(
      projectRateDeltaToBookingCom({
        delta: {
          tenantId: command.tenantId,
          unitId: command.unitId,
          connectionId: input.connectionId,
          mappingId: input.mappingId,
          from: command.from,
          to: command.to,
          currency: input.ratePlan.currency,
          nightlyRates: snapshot.nights
            .filter((n) => n.price != null)
            .map((n) => ({ date: n.date, amount: n.price! })),
        },
        hotelId: input.hotelId,
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId,
        mappingVersion: input.mappingVersion,
        generation,
        inboundOriginProvider: input.inboundOriginProvider,
        inboundOriginConnectionId: input.inboundOriginConnectionId,
      }),
    );
  }

  if (command.changeKinds.includes("restrictions") && snapshot.nights.length > 0) {
    const sample = snapshot.nights[0]!;
    projections.push(
      projectRestrictionDeltaToBookingCom({
        delta: {
          tenantId: command.tenantId,
          unitId: command.unitId,
          connectionId: input.connectionId,
          mappingId: input.mappingId,
          from: command.from,
          to: command.to,
          minStay: sample.minStay,
          maxStay: sample.maxStay,
          closedToArrival: sample.closedToArrival,
          closedToDeparture: sample.closedToDeparture,
        },
        hotelId: input.hotelId,
        roomTypeId: input.roomTypeId,
        ratePlanId: input.ratePlanId ?? "0",
        mappingVersion: input.mappingVersion,
        generation,
        inboundOriginProvider: input.inboundOriginProvider,
        inboundOriginConnectionId: input.inboundOriginConnectionId,
      }),
    );
  }

  return projections;
}

function addOneDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return dt.toISOString().slice(0, 10);
}
