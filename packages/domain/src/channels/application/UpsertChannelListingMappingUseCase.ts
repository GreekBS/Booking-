import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { ActorContext, PermissionChecker } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { ChannelListingMapping } from "../domain/ChannelListingMapping";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { SyncDirection } from "../domain/SyncDirection";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelListingMappingRepository } from "../ports/IChannelListingMappingRepository";
import type {
  IcalMappingLifecycleMutationResult,
  IcalMappingMutationKind,
  IIcalChannelMappingLifecycleStore,
} from "../ports/IIcalChannelMappingLifecycleStore";
import { assertActorCanAccessChannelProperty } from "./ChannelConnectionPropertyAuthorization";

export interface UpsertChannelListingMappingCommand {
  tenantId: string;
  connectionId: string;
  externalListingId: string;
  externalUnitId?: string | null;
  propertyId: string;
  unitId: string;
  syncDirection?: SyncDirection;
  /** Existing mapping to mutate. When omitted it is resolved by external identity. */
  mappingId?: string | null;
  /**
   * Replacement path: archive `replaceMappingId` and activate a brand-new
   * mapping in the same connection-locked transaction.
   */
  replaceMappingId?: string | null;
  /** Epoch CAS observed by the operator. */
  expectedSemanticConfigVersion: number;
  reason?: string | null;
  now?: Date;
}

export interface UpsertChannelListingMappingResult
  extends IcalMappingLifecycleMutationResult {
  readonly connectionId: string;
  readonly mutationKind: IcalMappingMutationKind;
}

/** Mutations that reassign inventory ownership require a paused connection. */
const PAUSED_ONLY: readonly ChannelConnectionStatus[] = ["paused"];
/** Metadata-shaped mutations may run while the connection is active or paused. */
const ACTIVE_OR_PAUSED: readonly ChannelConnectionStatus[] = ["active", "paused"];

/**
 * P1-S6c listing mapping upsert for iCal connections.
 *
 * Change classification drives the epoch policy:
 *
 * | kind                     | epoch bump | cursor baseline | connection must be |
 * |--------------------------|-----------|-----------------|--------------------|
 * | `create`                 | no        | no              | active or paused   |
 * | `property_only`          | no        | no              | active or paused   |
 * | `external_identity_only` | no        | no              | active or paused   |
 * | `unit_change`            | yes       | yes + supersede | paused             |
 * | `replacement`            | yes       | yes + supersede | paused             |
 *
 * Non-epoch mutations still report `requiresPollRematerialization: true`.
 * After an epoch bump, superseded-epoch `channel_import` blocks are soft-released.
 * Operator workflow remains pause → mutate → resume → poll for rematerialization.
 */
export class UpsertChannelListingMappingUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly mappingRepository: IChannelListingMappingRepository,
    private readonly lifecycleStore: IIcalChannelMappingLifecycleStore,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: UpsertChannelListingMappingCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<UpsertChannelListingMappingResult, Error>> {
    try {
      const tenantId = requireId(command.tenantId, "tenantId");
      const connectionId = requireId(command.connectionId, "connectionId");

      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      assertActorCanAccessChannelProperty(
        this.permissionChecker,
        actor,
        tenantId,
        command.propertyId,
      );

      const expectedSemanticConfigVersion = requirePositiveInt(
        command.expectedSemanticConfigVersion,
        "expectedSemanticConfigVersion",
      );
      const reason = normalizeReason(command.reason);
      const now = command.now ?? new Date();
      const syncDirection: SyncDirection = command.syncDirection ?? "inbound";
      const externalUnitId = command.externalUnitId ?? null;

      const connection = await this.connectionRepository.findById(tenantId, connectionId);
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }
      if (connection.provider !== "ical") {
        return Result.fail(
          new ConflictError(
            "iCal mapping lifecycle is only supported for iCal connections",
            "provider_mismatch",
          ),
        );
      }

      const replaced = command.replaceMappingId
        ? await this.requireMapping(tenantId, connectionId, command.replaceMappingId)
        : null;

      const existing = replaced
        ? null
        : await this.resolveExisting(
            tenantId,
            connectionId,
            command.mappingId,
            command.externalListingId,
            externalUnitId,
          );

      let mutationKind: IcalMappingMutationKind;
      let mapping: ChannelListingMapping;

      if (existing) {
        mutationKind = classifyExistingChange(existing, {
          externalListingId: command.externalListingId.trim(),
          externalUnitId,
          propertyId: command.propertyId.trim(),
          unitId: command.unitId.trim(),
          syncDirection,
        });
        mapping = existing;
        if (mutationKind !== "noop") {
          mapping.updateExternalMapping(
            { externalListingId: command.externalListingId, externalUnitId },
            now,
          );
          mapping.updateSyncDirection(syncDirection, now);
          mapping.updateInternalMapping(
            { propertyId: command.propertyId, unitId: command.unitId },
            now,
          );
        }
      } else {
        mutationKind = replaced ? "replacement" : "create";
        mapping = ChannelListingMapping.createActive({
          id: this.idGenerator.generate(),
          tenantId,
          connectionId,
          externalListingId: command.externalListingId,
          externalUnitId,
          propertyId: command.propertyId,
          unitId: command.unitId,
          syncDirection,
          now,
        });
      }

      if (replaced) {
        replaced.archive(now);
      }

      const requiresEpochBump =
        mutationKind === "unit_change" || mutationKind === "replacement";

      const result = await this.lifecycleStore.mutateUnderConnectionLock({
        tenantId,
        connectionId,
        actorId: audit.actorId,
        mutationKind,
        allowedConnectionStatuses: requiresEpochBump ? PAUSED_ONLY : ACTIVE_OR_PAUSED,
        expectedSemanticConfigVersion,
        mapping: mutationKind === "noop" ? null : mapping,
        deactivatedMapping: replaced,
        requiresEpochBump,
        auditAction: "channel.connection.listing_mapping_upserted",
        auditMetadata: {
          externalListingIdChanged:
            existing != null && existing.externalListingId !== command.externalListingId.trim(),
          propertyId: command.propertyId.trim(),
          unitId: command.unitId.trim(),
          syncDirection,
        },
        reason,
        ipAddress: audit.ipAddress,
        now,
      });

      return Result.ok({ ...result, connectionId, mutationKind });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async requireMapping(
    tenantId: string,
    connectionId: string,
    mappingId: string,
  ): Promise<ChannelListingMapping> {
    const mapping = await this.mappingRepository.findById(tenantId, mappingId.trim());
    if (!mapping || mapping.connectionId !== connectionId) {
      throw new NotFoundError("ChannelListingMapping", mappingId);
    }
    return mapping;
  }

  private async resolveExisting(
    tenantId: string,
    connectionId: string,
    mappingId: string | null | undefined,
    externalListingId: string,
    externalUnitId: string | null,
  ): Promise<ChannelListingMapping | null> {
    if (mappingId) {
      return this.requireMapping(tenantId, connectionId, mappingId);
    }
    return this.mappingRepository.findByExternalListing(
      tenantId,
      connectionId,
      externalListingId.trim(),
      externalUnitId,
    );
  }
}

function classifyExistingChange(
  existing: ChannelListingMapping,
  next: {
    externalListingId: string;
    externalUnitId: string | null;
    propertyId: string;
    unitId: string;
    syncDirection: SyncDirection;
  },
): IcalMappingMutationKind {
  if (existing.unitId !== next.unitId) {
    return "unit_change";
  }
  if (existing.propertyId !== next.propertyId) {
    return "property_only";
  }
  if (
    existing.externalListingId !== next.externalListingId ||
    existing.externalUnitId !== next.externalUnitId ||
    existing.syncDirection !== next.syncDirection
  ) {
    return "external_identity_only";
  }
  return "noop";
}

function requireId(value: string, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}

function requirePositiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive integer`);
  }
  return value;
}

function normalizeReason(reason: string | null | undefined): string | null {
  if (reason == null) {
    return null;
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > 500) {
    throw new ValidationError("reason must be at most 500 characters");
  }
  return trimmed;
}
