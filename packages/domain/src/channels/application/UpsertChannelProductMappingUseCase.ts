import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type {
  IChannelConnectionProviderSetupRepository,
  IChannelProductMappingRepository,
} from "../ports/IChannelProductMappingRepository";
import {
  ChannelProductMapping,
  type ChannelProductMappingKind,
} from "../domain/ChannelProductMapping";
import {
  BOOKING_COM_MAPPING_EVENTS,
  emitBookingComMappingEvent,
  type BookingComMappingLogFn,
} from "../providers/booking_com/sync/bookingComAriDiff";
import {
  parseBookingComConnectionSetup,
  type BookingComConnectionSetup,
} from "../providers/booking_com/setup/BookingComConnectionSetup";
import type { ChannelSource } from "../types/ChannelSource";

export interface UpsertChannelProductMappingCommand {
  tenantId: string;
  connectionId: string;
  mappingId?: string;
  kind: ChannelProductMappingKind;
  propertyId?: string | null;
  unitId?: string | null;
  ratePlanId?: string | null;
  externalHotelId?: string | null;
  externalRoomTypeId?: string | null;
  externalRatePlanId?: string | null;
  externalRoomRateKey?: string | null;
}

export interface UpsertChannelProductMappingResult {
  mappingId: string;
  mappingVersion: number;
  mappingConfigGeneration: number;
}

/**
 * Upsert provider-generic product mappings for Booking.com (and future OTAs).
 * Bumps connection mappingConfigGeneration on every write.
 */
export class UpsertChannelProductMappingUseCase {
  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly setups: IChannelConnectionProviderSetupRepository,
    private readonly mappings: IChannelProductMappingRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly log: BookingComMappingLogFn = () => {},
  ) {}

  async execute(
    command: UpsertChannelProductMappingCommand,
  ): Promise<Result<UpsertChannelProductMappingResult, Error>> {
    try {
      const connection = await this.connections.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection) {
        return Result.fail(new ValidationError("Connection not found"));
      }
      if (connection.provider !== "booking_com") {
        return Result.fail(
          new ValidationError("Product mapping upsert supports booking_com in CM-4c-4"),
        );
      }
      if (
        connection.status === "disconnected" ||
        connection.status === "draft"
      ) {
        return Result.fail(
          new ValidationError(
            `Cannot update mappings while connection is ${connection.status}`,
          ),
        );
      }

      const generation = await this.setups.bumpMappingConfigGeneration(
        command.tenantId,
        command.connectionId,
      );

      // Stamp all active mappings on this connection to the new generation so
      // the connection-scoped config version stays coherent after any edit.
      const existingActive = await this.mappings.listByConnection(
        command.tenantId,
        command.connectionId,
      );
      for (const other of existingActive) {
        if (other.status !== "active") continue;
        if (command.mappingId && other.id === command.mappingId) continue;
        if (other.mappingConfigGeneration === generation) continue;
        other.stampMappingConfigGeneration(generation);
        await this.mappings.save(other);
      }

      let mapping: ChannelProductMapping;
      if (command.mappingId) {
        const existing = await this.mappings.findById(
          command.tenantId,
          command.mappingId,
        );
        if (!existing) {
          return Result.fail(new ValidationError("Mapping not found"));
        }
        existing.replaceBinding(
          {
            propertyId: command.propertyId ?? existing.propertyId,
            unitId: command.unitId ?? existing.unitId,
            ratePlanId: command.ratePlanId ?? existing.ratePlanId,
            externalHotelId: command.externalHotelId ?? existing.externalHotelId,
            externalRoomTypeId:
              command.externalRoomTypeId ?? existing.externalRoomTypeId,
            externalRatePlanId:
              command.externalRatePlanId ?? existing.externalRatePlanId,
            externalRoomRateKey:
              command.externalRoomRateKey ?? existing.externalRoomRateKey,
          },
          generation,
        );
        mapping = existing;
      } else {
        mapping = ChannelProductMapping.createActive({
          id: this.idGenerator.generate(),
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          provider: connection.provider as ChannelSource,
          kind: command.kind,
          propertyId: command.propertyId,
          unitId: command.unitId,
          ratePlanId: command.ratePlanId,
          externalHotelId: command.externalHotelId,
          externalRoomTypeId: command.externalRoomTypeId,
          externalRatePlanId: command.externalRatePlanId,
          externalRoomRateKey: command.externalRoomRateKey,
          mappingConfigGeneration: generation,
        });
      }

      // Enforce V1: single hotel binding per connection
      if (mapping.kind === "property_hotel") {
        const existingHotels = await this.mappings.listActiveByConnectionAndKind(
          command.tenantId,
          command.connectionId,
          "property_hotel",
        );
        for (const other of existingHotels) {
          if (other.id !== mapping.id) {
            other.archive();
            await this.mappings.save(other);
          }
        }
      }

      await this.mappings.save(mapping);

      // Keep setup hotelId aligned when property mapping written
      if (mapping.kind === "property_hotel" && mapping.externalHotelId) {
        await this.patchSetupHotel(
          command.tenantId,
          command.connectionId,
          mapping.externalHotelId,
          generation,
        );
      }

      emitBookingComMappingEvent(this.log, BOOKING_COM_MAPPING_EVENTS.CHANGED, {
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        mappingId: mapping.id,
        kind: mapping.kind,
        mappingVersion: mapping.mappingVersion,
        mappingConfigGeneration: generation,
      });

      return Result.ok({
        mappingId: mapping.id,
        mappingVersion: mapping.mappingVersion,
        mappingConfigGeneration: generation,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async patchSetupHotel(
    tenantId: string,
    connectionId: string,
    hotelId: string,
    generation: number,
  ): Promise<void> {
    const existing = await this.setups.get(tenantId, connectionId);
    const parsed = existing?.setup
      ? parseBookingComConnectionSetup(existing.setup)
      : null;
    const next: BookingComConnectionSetup = {
      hotelId,
      approvedConnectionTypes: parsed?.approvedConnectionTypes ?? [
        "Reservations",
        "AVAILABILITY",
      ],
      pricingModel: parsed?.pricingModel ?? "Standard",
      setupProgress: parsed?.setupProgress ?? "hotel_bound",
      mappingReady: parsed?.mappingReady ?? false,
      initialSyncReady: parsed?.initialSyncReady ?? false,
    };
    await this.setups.upsert({
      tenantId,
      connectionId,
      provider: "booking_com",
      setup: { ...next },
      mappingConfigGeneration: generation,
      updatedAt: new Date(),
    });
  }
}
