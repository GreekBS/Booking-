import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IChannelProductMappingRepository } from "../ports/IChannelProductMappingRepository";
import type { IBookingComAriPushLedger } from "../ports/IBookingComAriPushLedger";
import type { IBookingComAriClient } from "../providers/booking_com/ari/IBookingComAriClient";
import { batchBookingComAriProjectionByMonth } from "../providers/booking_com/ari/bookingComAriBatch";
import { isStaleBookingComAriGeneration } from "../providers/booking_com/ari/bookingComAriCoalesce";
import {
  classifyBookingComAriPushResult,
} from "../providers/booking_com/ari/bookingComAriXml";
import {
  BOOKING_COM_ARI_EVENTS,
  emitBookingComAriEvent,
  type BookingComAriLogFn,
} from "../providers/booking_com/ari/bookingComAriObservability";
import type { BookingComAriResolvedProjection } from "../providers/booking_com/ari/BookingComAriProjection";

export class BookingComAriRetryablePushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingComAriRetryablePushError";
  }
}

export class BookingComAriPermanentPushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingComAriPermanentPushError";
  }
}

export interface ExecuteBookingComAriPushCommand {
  tenantId: string;
  connectionId: string;
  coalesceKey: string;
  generation: number;
}

export type ExecuteBookingComAriPushResult =
  | { outcome: "pushed"; ruid: string | null }
  | { outcome: "stale_suppressed" }
  | { outcome: "partial"; ruid: string | null; errorCode: string };

/**
 * Worker-side ARI push. Uses ledger for coalesce/stale; AriClient for transport.
 */
export class ExecuteBookingComAriPushUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly ledger: IBookingComAriPushLedger,
    private readonly ariClient: IBookingComAriClient,
    private readonly log: BookingComAriLogFn = () => {},
    private readonly productMappings: IChannelProductMappingRepository | null = null,
  ) {}

  async execute(
    command: ExecuteBookingComAriPushCommand,
  ): Promise<Result<ExecuteBookingComAriPushResult, Error>> {
    try {
      const connection = await this.connectionRepository.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection) {
        throw new BookingComAriPermanentPushError("Connection missing");
      }
      // Initial-sync work may be enqueued while pending_auth; retry until activated.
      if (connection.status === "pending_auth") {
        throw new BookingComAriRetryablePushError(
          "Connection pending_auth — waiting for activation before ARI push",
        );
      }
      if (connection.status !== "active") {
        throw new BookingComAriPermanentPushError(
          `Connection not active (${connection.status})`,
        );
      }
      if (!connection.credentialRef) {
        throw new BookingComAriPermanentPushError("Credential unavailable");
      }

      const record = await this.ledger.get({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        coalesceKey: command.coalesceKey,
      });
      if (!record?.pendingProjection) {
        emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.STALE_SUPPRESSED, {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          generation: command.generation,
        });
        return Result.ok({ outcome: "stale_suppressed" });
      }

      const stale = isStaleBookingComAriGeneration({
        candidateGeneration: command.generation,
        highestKnownGeneration: record.highestGeneration,
        lastSucceededGeneration: record.lastSucceededGeneration,
      });
      if (stale !== "ok") {
        emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.STALE_SUPPRESSED, {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          hotelId: record.pendingProjection.hotelId,
          generation: command.generation,
          operationType: record.pendingProjection.fieldFamily,
        });
        await this.ledger.markOutcome({
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          coalesceKey: command.coalesceKey,
          outcome: "stale_suppressed",
        });
        return Result.ok({ outcome: "stale_suppressed" });
      }

      // Always push the latest pending projection for this coalesce key.
      const projection = record.pendingProjection;
      await this.assertMapping(projection);

      const monthKey = monthKeyFromCoalesceKey(command.coalesceKey);
      const batches = batchBookingComAriProjectionByMonth(projection);
      const toPush =
        monthKey != null
          ? batches.filter((b) => b.monthKey === monthKey)
          : batches;
      if (toPush.length === 0) {
        return Result.ok({ outcome: "stale_suppressed" });
      }

      let lastRuid: string | null = null;
      for (const batch of toPush) {
        emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.PUSH_STARTED, {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          hotelId: projection.hotelId,
          monthKey: batch.monthKey,
          generation: projection.generation,
          operationType: projection.fieldFamily,
          dateFrom: projection.from,
          dateTo: projection.to,
        });

        let result;
        try {
          result = await this.ariClient.pushAvailabilityRatesRestrictions(batch);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.PUSH_FAILURE, {
            tenantId: command.tenantId,
            connectionId: command.connectionId,
            hotelId: projection.hotelId,
            generation: projection.generation,
            errorCode: "TRANSPORT",
          });
          emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.RETRY_SCHEDULED, {
            tenantId: command.tenantId,
            connectionId: command.connectionId,
            hotelId: projection.hotelId,
            generation: projection.generation,
            errorCode: "TRANSPORT",
          });
          throw new BookingComAriRetryablePushError(message);
        }

        lastRuid = result.ruid;
        const classification = classifyBookingComAriPushResult(result);

        if (classification === "full_success") {
          emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.PUSH_SUCCESS, {
            tenantId: command.tenantId,
            connectionId: command.connectionId,
            hotelId: projection.hotelId,
            monthKey: batch.monthKey,
            generation: projection.generation,
            ruid: result.ruid,
            operationType: projection.fieldFamily,
          });
          continue;
        }

        const errorCode = result.errors[0]?.code ?? `HTTP_${result.httpStatus}`;
        if (classification === "retryable_failure") {
          emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.PUSH_FAILURE, {
            tenantId: command.tenantId,
            connectionId: command.connectionId,
            hotelId: projection.hotelId,
            generation: projection.generation,
            ruid: result.ruid,
            errorCode,
            httpStatus: result.httpStatus,
          });
          emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.RETRY_SCHEDULED, {
            tenantId: command.tenantId,
            connectionId: command.connectionId,
            hotelId: projection.hotelId,
            generation: projection.generation,
            errorCode,
            httpStatus: result.httpStatus,
          });
          throw new BookingComAriRetryablePushError(
            `Retryable Booking.com ARI failure: ${errorCode}`,
          );
        }

        if (classification === "partial_error") {
          emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.PARTIAL_ERROR, {
            tenantId: command.tenantId,
            connectionId: command.connectionId,
            hotelId: projection.hotelId,
            generation: projection.generation,
            ruid: result.ruid,
            errorCode,
            httpStatus: result.httpStatus,
          });
          await this.ledger.markOutcome({
            tenantId: command.tenantId,
            connectionId: command.connectionId,
            coalesceKey: command.coalesceKey,
            outcome: "partial",
            error: errorCode,
            ruid: result.ruid,
          });
          return Result.ok({
            outcome: "partial",
            ruid: result.ruid,
            errorCode,
          });
        }

        emitBookingComAriEvent(this.log, BOOKING_COM_ARI_EVENTS.PUSH_FAILURE, {
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          hotelId: projection.hotelId,
          generation: projection.generation,
          ruid: result.ruid,
          errorCode,
          httpStatus: result.httpStatus,
        });
        await this.ledger.markOutcome({
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          coalesceKey: command.coalesceKey,
          outcome: "failed",
          error: errorCode,
          ruid: result.ruid,
        });
        throw new BookingComAriPermanentPushError(
          `Permanent Booking.com ARI failure: ${errorCode}`,
        );
      }

      await this.ledger.markSucceeded({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        coalesceKey: command.coalesceKey,
        generation: projection.generation,
        ruid: lastRuid,
      });
      return Result.ok({ outcome: "pushed", ruid: lastRuid });
    } catch (error) {
      if (
        error instanceof BookingComAriRetryablePushError ||
        error instanceof BookingComAriPermanentPushError
      ) {
        return Result.fail(error);
      }
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async assertMapping(
    projection: BookingComAriResolvedProjection,
  ): Promise<void> {
    if (this.productMappings) {
      const product = await this.productMappings.findById(
        projection.tenantId,
        projection.mappingId,
      );
      if (product && product.status === "active") {
        if (product.mappingVersion !== projection.mappingVersion) {
          throw new BookingComAriPermanentPushError("Mapping version stale");
        }
        if (!product.externalRoomTypeId) {
          throw new ValidationError("Room mapping required for Booking.com ARI");
        }
        return;
      }
    }

    const mapping = await this.mappingRepository.findById(
      projection.tenantId,
      projection.mappingId,
    );
    if (!mapping || mapping.status !== "active") {
      throw new BookingComAriPermanentPushError("Listing mapping not found");
    }
    if (mapping.mappingVersion !== projection.mappingVersion) {
      throw new BookingComAriPermanentPushError("Mapping version stale");
    }
    if (!mapping.externalUnitId) {
      throw new ValidationError("Room mapping required for Booking.com ARI");
    }
  }
}

function monthKeyFromCoalesceKey(coalesceKey: string): string | null {
  const parts = coalesceKey.split(":");
  // bcom-ari : tenant : connection : hotel : room : rate : YYYY-MM : family
  if (parts.length < 8) return null;
  const month = parts[parts.length - 2];
  return month && /^\d{4}-\d{2}$/.test(month) ? month : null;
}
