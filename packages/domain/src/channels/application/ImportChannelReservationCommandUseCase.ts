import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { Result } from "../../shared/kernel/Result";
import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import { createChannelImportActor } from "../../commerce/application/channelImportActor";
import type { PrepareReservationUseCase } from "../../commerce/application/PrepareReservationUseCase";
import { mutationOriginChannel } from "../../shared/types/MutationOrigin";
import { ResolveOrCreateGuest } from "../../guests";
import { ExternalReservationLink } from "../domain/ExternalReservationLink";
import { ChannelImportKey } from "../domain/value-objects/ChannelImportKey";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type { IChannelReservationImportPersistencePort } from "../ports/IChannelReservationImportPersistencePort";
import type { IExternalReservationLinkRepository } from "../ports/IExternalReservationLinkRepository";
import type {
  ImportChannelReservationCommand,
  ImportChannelReservationCommandResult,
} from "./ImportChannelReservationCommandResult";

const LINK_DUPLICATE_MESSAGE = "External reservation link already exists for this connection";
const STALE_MAPPING_MESSAGE =
  "Mapping version changed since dry-run; re-run CM-3a import dry-run";

function normalizeRequiredId(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}

function isLinkDuplicateConflict(error: unknown): boolean {
  return error instanceof ConflictError && error.message === LINK_DUPLICATE_MESSAGE;
}

/**
 * CM-3b-3: channel CREATE import.
 *
 * Guest CRM resolution runs inside the same tenant TX as commitImport
 * (after normalized reservation prep). Transport/inbox layers stay CRM-unaware.
 *
 * Duplicate external reservation (early link or unique race) returns without
 * creating a new Guest. MODIFY/CANCEL paths never call this use case for Guest.
 */
export class ImportChannelReservationCommandUseCase {
  constructor(
    private readonly linkRepository: IExternalReservationLinkRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly prepareReservationUseCase: PrepareReservationUseCase,
    private readonly importPersistence: IChannelReservationImportPersistencePort,
    private readonly idGenerator: IIdGenerator,
    private readonly resolveOrCreateGuest: ResolveOrCreateGuest,
  ) {}

  async execute(
    command: ImportChannelReservationCommand,
  ): Promise<Result<ImportChannelReservationCommandResult, Error>> {
    try {
      const { normalizedCommand, mappingContext, external } = command;
      const tenantId = normalizedCommand.tenantId;
      const connectionId = normalizeRequiredId(external.connectionId, "Connection id");
      const externalReservationId = normalizeRequiredId(
        external.externalReservationId,
        "External reservation id",
      );
      const importKey = ChannelImportKey.create(connectionId, externalReservationId);

      const existingLink = await this.linkRepository.findByExternalReservation(
        tenantId,
        connectionId,
        externalReservationId,
      );
      if (existingLink) {
        return Result.ok({ outcome: "duplicate", link: existingLink });
      }

      const mappingValidation = await this.validateMapping(
        tenantId,
        mappingContext,
        normalizedCommand,
        external.provider,
        externalReservationId,
      );
      if (mappingValidation.isFailure) {
        return Result.fail(mappingValidation.getError());
      }

      const origin = mutationOriginChannel({
        provider: external.provider,
        connectionId,
        externalReservationId,
      });

      const actor = createChannelImportActor(tenantId);
      const prepared = await this.prepareReservationUseCase.prepare(
        {
          reservation: normalizedCommand,
          profile: {
            confirmImmediately: true,
            idempotencyKey: importKey.value,
            actor,
            writeAudit: false,
          },
        },
        origin,
      );
      if (prepared.isFailure) {
        return Result.fail(prepared.getError());
      }

      const { hold, quote, booking } = prepared.getValue();
      if (
        booking.tenantId !== tenantId ||
        booking.propertyId !== mappingContext.propertyId ||
        booking.unitId !== mappingContext.unitId ||
        booking.status !== "confirmed"
      ) {
        return Result.fail(new ValidationError("Prepared booking does not match import context"));
      }

      const link = ExternalReservationLink.createLink({
        id: this.idGenerator.generate(),
        tenantId,
        provider: external.provider,
        connectionId,
        externalReservationId,
        bookingId: booking.id,
        mappingId: mappingContext.mappingId,
        mappingVersion: mappingContext.mappingVersion,
        externalRevision: external.externalRevision ?? null,
        lastExternalUpdateAt: external.lastExternalUpdateAt ?? null,
      });

      try {
        await this.importPersistence.runInTenantTransaction(tenantId, async () => {
          const resolved = await this.resolveOrCreateGuest.executeForBookingCreate(
            {
              tenantId,
              contact: {
                displayName: normalizedCommand.guest.name,
                email: normalizedCommand.guest.email,
                phone: normalizedCommand.guest.phone,
              },
            },
            actor,
          );
          if (resolved.isFailure) {
            throw resolved.getError();
          }
          booking.linkGuest(resolved.getValue().guest.id);
          await this.importPersistence.commitImport({ hold, quote, booking, link });
        });
      } catch (error) {
        if (isLinkDuplicateConflict(error)) {
          const racedLink = await this.linkRepository.findByExternalReservation(
            tenantId,
            connectionId,
            externalReservationId,
          );
          if (racedLink) {
            return Result.ok({ outcome: "duplicate", link: racedLink });
          }
        }
        throw error;
      }

      return Result.ok({ outcome: "created", booking, link });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async validateMapping(
    tenantId: string,
    mappingContext: ImportChannelReservationCommand["mappingContext"],
    normalizedCommand: ImportChannelReservationCommand["normalizedCommand"],
    provider: ImportChannelReservationCommand["external"]["provider"],
    externalReservationId: string,
  ): Promise<Result<void, Error>> {
    const mapping = await this.mappingRepository.findById(tenantId, mappingContext.mappingId);
    if (!mapping) {
      return Result.fail(new ValidationError("Listing mapping not found"));
    }
    if (mapping.status !== "active") {
      return Result.fail(new ValidationError("Listing mapping is not active"));
    }
    if (mapping.connectionId !== mappingContext.connectionId) {
      return Result.fail(new ValidationError("Mapping connection does not match import context"));
    }
    if (mapping.propertyId !== mappingContext.propertyId) {
      return Result.fail(new ValidationError("Mapping property does not match import context"));
    }
    if (mapping.unitId !== mappingContext.unitId) {
      return Result.fail(new ValidationError("Mapping unit does not match import context"));
    }
    if (mapping.mappingVersion !== mappingContext.mappingVersion) {
      return Result.fail(new ConflictError(STALE_MAPPING_MESSAGE));
    }
    if (normalizedCommand.tenantId !== tenantId) {
      return Result.fail(new ValidationError("Normalized command tenant does not match import"));
    }
    if (normalizedCommand.propertyId !== mappingContext.propertyId) {
      return Result.fail(new ValidationError("Normalized command property does not match mapping"));
    }
    if (normalizedCommand.unitId !== mappingContext.unitId) {
      return Result.fail(new ValidationError("Normalized command unit does not match mapping"));
    }
    if (normalizedCommand.source !== provider) {
      return Result.fail(new ValidationError("Normalized command source does not match provider"));
    }
    if (normalizedCommand.externalReference) {
      if (normalizedCommand.externalReference.source !== provider) {
        return Result.fail(
          new ValidationError("Normalized command external reference source does not match provider"),
        );
      }
      if (normalizedCommand.externalReference.externalId !== externalReservationId) {
        return Result.fail(
          new ValidationError(
            "Normalized command external reference id does not match external reservation id",
          ),
        );
      }
    }
    return Result.ok(undefined);
  }
}
