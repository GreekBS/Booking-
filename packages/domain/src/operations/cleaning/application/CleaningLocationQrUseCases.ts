import { Result } from "../../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../../shared/services/PermissionChecker";
import type { IAuditLogRepository } from "../../../shared/ports/InfrastructurePorts";
import type { IPropertyRepository } from "../../../catalog/ports/ICatalogRepositories";
import type { AuditIpContext } from "../../application/TaskUseCases";
import type { CleaningLocationQrAccessRecord } from "../domain/CleaningLocationTypes";
import type { ICleaningLocationRepository } from "../ports/ICleaningLocationRepository";
import type { ICleaningLocationQrAccessRepository } from "../ports/ICleaningLocationQrAccessRepository";
import type { IUnitQrAccessRepository } from "../ports/IUnitQrAccessRepository";
import type { IOpaqueTokenFactory } from "../ports/IOpaqueTokenFactory";
import {
  canManageCleaningConfigOnProperty,
  canReadCleaningOnProperty,
} from "./cleaningAccess";

export interface CleaningLocationQrView {
  locationId: string;
  propertyId: string;
  locationName: string;
  propertyName: string;
  status: "ACTIVE" | "REVOKED" | "NONE";
  createdAt: Date | null;
  rotatedAt: Date | null;
  /**
   * Plaintext token — returned only in the response that mints it.
   * Existing codes cannot be re-read; rotate to print a new one.
   */
  token: string | null;
}

export interface ResolvedCleaningQr {
  locationId: string;
  locationName: string;
  propertyId: string;
  propertyName: string;
  /** Present when the location is linked to a commercial unit (legacy path). */
  unitId: string | null;
}

async function locatePropertyName(
  properties: IPropertyRepository,
  tenantId: string,
  propertyId: string,
): Promise<string | null> {
  const catalog = await properties.listUnitCatalog(tenantId);
  const property = catalog.properties.find((p) => p.id === propertyId);
  return property?.name ?? null;
}

function toView(
  record: CleaningLocationQrAccessRecord | null,
  location: { id: string; name: string; propertyId: string },
  propertyName: string,
  token: string | null,
): CleaningLocationQrView {
  return {
    locationId: location.id,
    propertyId: location.propertyId,
    locationName: location.name,
    propertyName,
    status: record ? record.status : "NONE",
    createdAt: record?.createdAt ?? null,
    rotatedAt: record?.rotatedAt ?? null,
    token,
  };
}

export class GetCleaningLocationQrUseCase {
  constructor(
    private readonly qrAccess: ICleaningLocationQrAccessRepository,
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; locationId: string },
    actor: ActorContext,
  ): Promise<Result<CleaningLocationQrView, Error>> {
    try {
      const location = await this.locations.findById(
        input.tenantId,
        input.locationId,
      );
      if (!location || location.status !== "active") {
        return Result.fail(
          new NotFoundError("Cleaning location", input.locationId),
        );
      }
      if (
        !canReadCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          location.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyName =
        (await locatePropertyName(
          this.properties,
          input.tenantId,
          location.propertyId,
        )) ?? "";

      const record = await this.qrAccess.findActiveByLocation(
        input.tenantId,
        input.locationId,
      );
      return Result.ok(toView(record, location, propertyName, null));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/**
 * Mints a code when the location has none. If an ACTIVE code already exists it
 * is returned without a token — only `RotateCleaningLocationQrUseCase` can replace it.
 */
export class GenerateCleaningLocationQrUseCase {
  constructor(
    private readonly qrAccess: ICleaningLocationQrAccessRepository,
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly tokens: IOpaqueTokenFactory,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; locationId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningLocationQrView, Error>> {
    try {
      const location = await this.locations.findById(
        input.tenantId,
        input.locationId,
      );
      if (!location || location.status !== "active") {
        return Result.fail(
          new NotFoundError("Cleaning location", input.locationId),
        );
      }
      if (
        !canManageCleaningConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          location.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyName =
        (await locatePropertyName(
          this.properties,
          input.tenantId,
          location.propertyId,
        )) ?? "";

      const minted = this.tokens.create();
      const { record, issued } = await this.qrAccess.issue({
        tenantId: input.tenantId,
        propertyId: location.propertyId,
        cleaningLocationId: input.locationId,
        tokenHash: minted.tokenHash,
        rotate: false,
      });

      if (issued) {
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "cleaning_location_qr.generated",
          resourceType: "cleaning_location_qr_access",
          resourceId: record.id,
          metadata: {
            locationId: input.locationId,
            propertyId: location.propertyId,
          },
          ipAddress: auditContext?.ipAddress ?? null,
        });
      }

      return Result.ok(
        toView(record, location, propertyName, issued ? minted.token : null),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class RotateCleaningLocationQrUseCase {
  constructor(
    private readonly qrAccess: ICleaningLocationQrAccessRepository,
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly tokens: IOpaqueTokenFactory,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; locationId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningLocationQrView, Error>> {
    try {
      const location = await this.locations.findById(
        input.tenantId,
        input.locationId,
      );
      if (!location || location.status !== "active") {
        return Result.fail(
          new NotFoundError("Cleaning location", input.locationId),
        );
      }
      if (
        !canManageCleaningConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          location.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyName =
        (await locatePropertyName(
          this.properties,
          input.tenantId,
          location.propertyId,
        )) ?? "";

      const minted = this.tokens.create();
      const { record } = await this.qrAccess.issue({
        tenantId: input.tenantId,
        propertyId: location.propertyId,
        cleaningLocationId: input.locationId,
        tokenHash: minted.tokenHash,
        rotate: true,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning_location_qr.rotated",
        resourceType: "cleaning_location_qr_access",
        resourceId: record.id,
        metadata: {
          locationId: input.locationId,
          propertyId: location.propertyId,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(toView(record, location, propertyName, minted.token));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/**
 * Exchanges a scanned token for cleaning-location identity.
 * Tries location QR first, then legacy unit QR → active location by commercialUnitId.
 * `ResolveUnitQrUseCase` remains unchanged for unit-only callers.
 */
export class ResolveCleaningQrUseCase {
  constructor(
    private readonly locationQr: ICleaningLocationQrAccessRepository,
    private readonly unitQr: IUnitQrAccessRepository,
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly tokens: IOpaqueTokenFactory,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; token: string },
    actor: ActorContext,
  ): Promise<Result<ResolvedCleaningQr, Error>> {
    try {
      const token = input.token.trim();
      if (!/^[0-9a-f]{64}$/i.test(token)) {
        return Result.fail(new ValidationError("Invalid QR token"));
      }

      const tokenHash = this.tokens.hash(token);

      const locationRecord = await this.locationQr.findByTokenHash(
        input.tenantId,
        tokenHash,
      );
      if (locationRecord && locationRecord.status === "ACTIVE") {
        return this.resolveFromLocationId(
          input.tenantId,
          locationRecord.cleaningLocationId,
          actor,
        );
      }

      const unitRecord = await this.unitQr.findActiveByTokenHash(
        input.tenantId,
        tokenHash,
      );
      if (!unitRecord) {
        return Result.fail(new NotFoundError("Cleaning QR", "token"));
      }

      const linked = await this.locations.findActiveByCommercialUnit(
        input.tenantId,
        unitRecord.unitId,
      );
      if (!linked) {
        return Result.fail(new NotFoundError("Cleaning location", unitRecord.unitId));
      }

      return this.resolveFromLocation(
        input.tenantId,
        linked,
        actor,
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async resolveFromLocationId(
    tenantId: string,
    locationId: string,
    actor: ActorContext,
  ): Promise<Result<ResolvedCleaningQr, Error>> {
    const location = await this.locations.findById(tenantId, locationId);
    if (!location || location.status !== "active") {
      return Result.fail(new NotFoundError("Cleaning location", locationId));
    }
    return this.resolveFromLocation(tenantId, location, actor);
  }

  private async resolveFromLocation(
    tenantId: string,
    location: {
      id: string;
      name: string;
      propertyId: string;
      commercialUnitId: string | null;
    },
    actor: ActorContext,
  ): Promise<Result<ResolvedCleaningQr, Error>> {
    if (
      !canReadCleaningOnProperty(
        this.permissionChecker,
        actor,
        tenantId,
        location.propertyId,
      )
    ) {
      return Result.fail(new ForbiddenError());
    }

    const propertyName =
      (await locatePropertyName(
        this.properties,
        tenantId,
        location.propertyId,
      )) ?? "";

    return Result.ok({
      locationId: location.id,
      locationName: location.name,
      propertyId: location.propertyId,
      propertyName,
      unitId: location.commercialUnitId,
    });
  }
}
