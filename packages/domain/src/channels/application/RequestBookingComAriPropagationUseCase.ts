import { Result } from "../../shared/kernel/Result";
import type { DomainEvent } from "../../shared/kernel/DomainEvent";
import type { IOutboxRepository } from "../../shared/ports/InfrastructurePorts";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IChannelProductMappingRepository } from "../ports/IChannelProductMappingRepository";
import type { IBookingComAriPushLedger } from "../ports/IBookingComAriPushLedger";
import type { BookingComAriResolvedProjection } from "../providers/booking_com/ari/BookingComAriProjection";
import {
  buildBookingComAriCoalesceKey,
} from "../providers/booking_com/ari/BookingComAriProjection";
import { enumerateMonthKeys } from "../providers/booking_com/ari/bookingComAriBatch";
import {
  BOOKING_COM_ARI_PUSH_AGGREGATE_TYPE,
  BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE,
  buildBookingComAriPushDeliveryKey,
} from "../providers/booking_com/ari/bookingComAriOutboxIdentity";
import { shouldSuppressChannelOutboundEcho } from "./channelOutboundLoopSuppression";
import { parseBookingComConnectionSetup } from "../providers/booking_com/setup/BookingComConnectionSetup";

export interface RequestBookingComAriPropagationCommand {
  projection: BookingComAriResolvedProjection;
  /** Optional setup blob from connection metadata when persisted (CM-4c-4). */
  connectionSetup?: unknown;
  /**
   * CM-4c-4: allow durable enqueue while connection is still pending_auth
   * (initial sync confirm happens before activation).
   */
  allowPendingAuth?: boolean;
}

export type RequestBookingComAriPropagationResult =
  | { outcome: "scheduled"; coalesceKeys: string[]; generation: number }
  | { outcome: "suppressed_loop" }
  | { outcome: "rejected"; reason: string };

/**
 * Durable schedule only — never calls Booking.com HTTP.
 * Commerce / inventory mutations commit first, then invoke this.
 */
export class RequestBookingComAriPropagationUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly outboxRepository: IOutboxRepository,
    private readonly ledger: IBookingComAriPushLedger,
    /** CM-4c-4: optional product mappings (room/rate) as ARI authority. */
    private readonly productMappings: IChannelProductMappingRepository | null = null,
  ) {}

  async execute(
    command: RequestBookingComAriPropagationCommand,
  ): Promise<Result<RequestBookingComAriPropagationResult, Error>> {
    try {
      const projection = command.projection;

      if (
        shouldSuppressChannelOutboundEcho({
          outboundProvider: "booking_com",
          outboundConnectionId: projection.connectionId,
          mutationOrigin:
            projection.inboundOriginConnectionId != null
              ? {
                  kind: "channel" as const,
                  channel: {
                    provider: projection.inboundOriginProvider ?? "booking_com",
                    connectionId: projection.inboundOriginConnectionId,
                  },
                }
              : null,
        })
      ) {
        return Result.ok({ outcome: "suppressed_loop" });
      }

      if (projection.pricingModel !== "Standard") {
        return Result.ok({
          outcome: "rejected",
          reason: `Unsupported pricing model: ${projection.pricingModel}`,
        });
      }

      const connection = await this.connectionRepository.findById(
        projection.tenantId,
        projection.connectionId,
      );
      if (!connection) {
        return Result.ok({ outcome: "rejected", reason: "Connection not found" });
      }
      if (connection.provider !== "booking_com") {
        return Result.ok({ outcome: "rejected", reason: "Connection provider mismatch" });
      }
      const statusOk =
        connection.status === "active" ||
        (command.allowPendingAuth === true && connection.status === "pending_auth");
      if (!statusOk) {
        return Result.ok({
          outcome: "rejected",
          reason: `Connection status is ${connection.status}`,
        });
      }
      if (!connection.credentialRef) {
        return Result.ok({ outcome: "rejected", reason: "Credential unavailable" });
      }

      const mappingOk = await this.assertMappingReady(projection);
      if (!mappingOk.ok) {
        return Result.ok({ outcome: "rejected", reason: mappingOk.reason });
      }

      if (command.connectionSetup != null) {
        const setup = parseBookingComConnectionSetup(command.connectionSetup);
        if (setup.pricingModel !== "Standard") {
          return Result.ok({
            outcome: "rejected",
            reason: `Unsupported pricing model: ${setup.pricingModel}`,
          });
        }
      }

      const coalesceKeys: string[] = [];
      const events: DomainEvent[] = [];

      for (const monthKey of enumerateMonthKeys(projection.from, projection.to)) {
        const coalesceKey = buildBookingComAriCoalesceKey({
          tenantId: projection.tenantId,
          connectionId: projection.connectionId,
          hotelId: projection.hotelId,
          roomTypeId: projection.roomTypeId,
          ratePlanId: projection.ratePlanId,
          monthKey,
          fieldFamily: projection.fieldFamily,
        });
        coalesceKeys.push(coalesceKey);

        await this.ledger.upsertPending({ coalesceKey, projection });

        const deliveryKey = buildBookingComAriPushDeliveryKey({
          tenantId: projection.tenantId,
          connectionId: projection.connectionId,
          coalesceKey,
          generation: projection.generation,
        });

        events.push({
          eventType: BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE,
          aggregateType: BOOKING_COM_ARI_PUSH_AGGREGATE_TYPE,
          aggregateId: projection.mappingId,
          tenantId: projection.tenantId,
          occurredAt: new Date(),
          payload: {
            connectionId: projection.connectionId,
            coalesceKey,
            generation: projection.generation,
            hotelId: projection.hotelId,
            roomTypeId: projection.roomTypeId,
            ratePlanId: projection.ratePlanId,
            mappingId: projection.mappingId,
            mappingVersion: projection.mappingVersion,
            fieldFamily: projection.fieldFamily,
            from: projection.from,
            to: projection.to,
            monthKey,
            projection,
          },
          deliveryKey,
        });
      }

      await this.outboxRepository.saveEvents(events);
      return Result.ok({
        outcome: "scheduled",
        coalesceKeys,
        generation: projection.generation,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async assertMappingReady(
    projection: BookingComAriResolvedProjection,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this.productMappings) {
      const product = await this.productMappings.findById(
        projection.tenantId,
        projection.mappingId,
      );
      if (product && product.status === "active") {
        if (product.mappingVersion !== projection.mappingVersion) {
          return { ok: false, reason: "Mapping version stale" };
        }
        if (
          product.kind !== "unit_room" &&
          product.kind !== "room_rate" &&
          product.kind !== "rate_plan"
        ) {
          return { ok: false, reason: "Product mapping kind not valid for ARI" };
        }
        if (
          !product.externalHotelId ||
          !product.externalRoomTypeId ||
          product.connectionId !== projection.connectionId
        ) {
          return { ok: false, reason: "Product mapping incomplete for ARI" };
        }
        return { ok: true };
      }
    }

    const mapping = await this.mappingRepository.findById(
      projection.tenantId,
      projection.mappingId,
    );
    if (!mapping || mapping.status !== "active") {
      return { ok: false, reason: "Mapping missing or inactive" };
    }
    if (mapping.mappingVersion !== projection.mappingVersion) {
      return { ok: false, reason: "Mapping version stale" };
    }
    if (
      mapping.syncDirection === "inbound" ||
      !mapping.externalUnitId ||
      !mapping.externalListingId
    ) {
      return { ok: false, reason: "Mapping incomplete for ARI" };
    }
    return { ok: true };
  }
}
