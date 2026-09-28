import { Result } from "../../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../../shared/services/PermissionChecker";
import type { IAuditLogRepository } from "../../../shared/ports/InfrastructurePorts";
import type { PropertyType } from "../../../shared/types/index";
import type { IPropertyRepository } from "../../../catalog/ports/ICatalogRepositories";
import type { AuditIpContext } from "../../application/TaskUseCases";
import {
  assertBulkCleaningLocationCount,
  cleaningLocationModeForPropertyType,
  defaultSingleCleaningLocationName,
  isHotelCleaningLocationMode,
  normalizeCleaningLocationName,
  type CleaningLocationHousekeepingMode,
} from "../domain/CleaningLocation";
import type {
  CleaningLocationBoardRow,
  CleaningLocationRecord,
} from "../domain/CleaningLocationTypes";
import type { ICleaningLocationRepository } from "../ports/ICleaningLocationRepository";
import {
  canManageCleaningConfigOnProperty,
  canReadCleaningOnProperty,
} from "./cleaningAccess";

export interface CleaningLocationsBoardResult {
  propertyType: PropertyType;
  mode: CleaningLocationHousekeepingMode;
  /**
   * Single-property mode with more than one active location (e.g. after
   * hotel → villa). Existing locations and history are preserved; operators
   * must resolve manually — no auto-delete/merge.
   */
  requiresManualResolution: boolean;
  rows: CleaningLocationBoardRow[];
}

async function loadPropertyType(
  properties: IPropertyRepository,
  tenantId: string,
  propertyId: string,
): Promise<Result<{ type: PropertyType; name: string }, Error>> {
  const property = await properties.findById(tenantId, propertyId);
  if (!property) {
    return Result.fail(new NotFoundError("Property", propertyId));
  }
  return Result.ok({ type: property.type, name: property.name });
}

export class BulkInitializeCleaningLocationsUseCase {
  constructor(
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; propertyId: string; count: number },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningLocationRecord[], Error>> {
    try {
      if (
        !canManageCleaningConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyResult = await loadPropertyType(
        this.properties,
        input.tenantId,
        input.propertyId,
      );
      if (propertyResult.isFailure) {
        return Result.fail(propertyResult.getError());
      }
      if (!isHotelCleaningLocationMode(propertyResult.getValue().type)) {
        return Result.fail(
          new ValidationError(
            "Bulk room setup is only available for hotel properties",
          ),
        );
      }

      try {
        assertBulkCleaningLocationCount(input.count);
      } catch (error) {
        return Result.fail(
          error instanceof Error ? error : new ValidationError(String(error)),
        );
      }

      const existing = await this.locations.countActiveByProperty(
        input.tenantId,
        input.propertyId,
      );
      if (existing > 0) {
        return Result.fail(
          new ConflictError(
            "Cleaning locations already exist for this property",
            "cleaning_locations_already_initialized",
          ),
        );
      }

      const created = await this.locations.bulkCreate({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        count: input.count,
        actorUserId: actor.userId,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning_location.bulk_initialized",
        resourceType: "cleaning_location",
        resourceId: input.propertyId,
        metadata: {
          propertyId: input.propertyId,
          count: created.length,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(created);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class AddCleaningLocationUseCase {
  constructor(
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; propertyId: string; name: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningLocationRecord, Error>> {
    try {
      if (
        !canManageCleaningConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyResult = await loadPropertyType(
        this.properties,
        input.tenantId,
        input.propertyId,
      );
      if (propertyResult.isFailure) {
        return Result.fail(propertyResult.getError());
      }
      if (!isHotelCleaningLocationMode(propertyResult.getValue().type)) {
        return Result.fail(
          new ValidationError(
            "Adding rooms is only available for hotel properties",
          ),
        );
      }

      let name: string;
      try {
        name = normalizeCleaningLocationName(input.name);
      } catch (error) {
        return Result.fail(
          error instanceof Error ? error : new ValidationError(String(error)),
        );
      }

      const created = await this.locations.add({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        name,
        actorUserId: actor.userId,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning_location.added",
        resourceType: "cleaning_location",
        resourceId: created.id,
        metadata: {
          propertyId: input.propertyId,
          name: created.name,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(created);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class RenameCleaningLocationUseCase {
  constructor(
    private readonly locations: ICleaningLocationRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; locationId: string; name: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningLocationRecord, Error>> {
    try {
      const existing = await this.locations.findById(
        input.tenantId,
        input.locationId,
      );
      if (!existing) {
        return Result.fail(
          new NotFoundError("Cleaning location", input.locationId),
        );
      }
      if (
        !canManageCleaningConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          existing.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      let name: string;
      try {
        name = normalizeCleaningLocationName(input.name);
      } catch (error) {
        return Result.fail(
          error instanceof Error ? error : new ValidationError(String(error)),
        );
      }

      const renamed = await this.locations.rename({
        tenantId: input.tenantId,
        locationId: input.locationId,
        name,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning_location.renamed",
        resourceType: "cleaning_location",
        resourceId: renamed.id,
        metadata: {
          propertyId: renamed.propertyId,
          name: renamed.name,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(renamed);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ArchiveCleaningLocationUseCase {
  constructor(
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; locationId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningLocationRecord, Error>> {
    try {
      const existing = await this.locations.findById(
        input.tenantId,
        input.locationId,
      );
      if (!existing) {
        return Result.fail(
          new NotFoundError("Cleaning location", input.locationId),
        );
      }
      if (
        !canManageCleaningConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          existing.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyResult = await loadPropertyType(
        this.properties,
        input.tenantId,
        existing.propertyId,
      );
      if (propertyResult.isFailure) {
        return Result.fail(propertyResult.getError());
      }

      const activeCount = await this.locations.countActiveByProperty(
        input.tenantId,
        existing.propertyId,
      );
      const mode = cleaningLocationModeForPropertyType(
        propertyResult.getValue().type,
      );
      // Single-property mode keeps one operational location. Allow archive when
      // resolving a multi-location leftover (hotel → villa), but never leave
      // zero active locations in single mode (would orphan history via recreate).
      if (mode === "single_property" && activeCount <= 1) {
        return Result.fail(
          new ConflictError(
            "Cannot archive the only cleaning location for this property",
            "cleaning_location_last_active",
          ),
        );
      }

      const archived = await this.locations.archive({
        tenantId: input.tenantId,
        locationId: input.locationId,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning_location.archived",
        resourceType: "cleaning_location",
        resourceId: archived.id,
        metadata: {
          propertyId: archived.propertyId,
          name: archived.name,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(archived);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListCleaningLocationsBoardUseCase {
  constructor(
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; propertyId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningLocationsBoardResult, Error>> {
    try {
      if (
        !canReadCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyResult = await loadPropertyType(
        this.properties,
        input.tenantId,
        input.propertyId,
      );
      if (propertyResult.isFailure) {
        return Result.fail(propertyResult.getError());
      }
      const { type, name } = propertyResult.getValue();
      const mode = cleaningLocationModeForPropertyType(type);

      let requiresManualResolution = false;

      if (mode === "single_property") {
        const activeCount = await this.locations.countActiveByProperty(
          input.tenantId,
          input.propertyId,
        );
        if (activeCount === 0) {
          if (
            !canManageCleaningConfigOnProperty(
              this.permissionChecker,
              actor,
              input.tenantId,
              input.propertyId,
            )
          ) {
            // Readers see empty board; managers/admins auto-provision.
            const rows = await this.locations.getBoard(
              input.tenantId,
              input.propertyId,
            );
            return Result.ok({
              propertyType: type,
              mode,
              requiresManualResolution: false,
              rows,
            });
          }

          const ensured = await this.locations.ensureSingleActive({
            tenantId: input.tenantId,
            propertyId: input.propertyId,
            name: defaultSingleCleaningLocationName(name),
            actorUserId: actor.userId,
          });

          if (ensured.created) {
            await this.audit?.append({
              tenantId: input.tenantId,
              actorId: actor.userId,
              action: "cleaning_location.single_ensured",
              resourceType: "cleaning_location",
              resourceId: ensured.location.id,
              metadata: {
                propertyId: input.propertyId,
                name: ensured.location.name,
                propertyType: type,
              },
              ipAddress: auditContext?.ipAddress ?? null,
            });
          }
        } else if (activeCount > 1) {
          requiresManualResolution = true;
        }
      }

      const rows = await this.locations.getBoard(
        input.tenantId,
        input.propertyId,
      );
      return Result.ok({
        propertyType: type,
        mode,
        requiresManualResolution,
        rows,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
