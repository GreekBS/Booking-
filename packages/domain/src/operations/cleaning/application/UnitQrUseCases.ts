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
import type { UnitQrAccessRecord } from "../domain/CleaningTypes";
import type { IUnitQrAccessRepository } from "../ports/IUnitQrAccessRepository";
import type { IOpaqueTokenFactory } from "../ports/IOpaqueTokenFactory";
import type { IHousekeepingQrTokenSealer } from "../ports/IHousekeepingQrTokenSealer";
import type { ICleaningLocationRepository } from "../ports/ICleaningLocationRepository";
import {
  canManageCleaningConfigOnProperty,
  canReadCleaningOnProperty,
} from "./cleaningAccess";

export interface UnitQrView {
  unitId: string;
  propertyId: string;
  unitName: string;
  propertyName: string;
  status: "ACTIVE" | "REVOKED" | "NONE";
  createdAt: Date | null;
  rotatedAt: Date | null;
  recoverable: boolean;
  /**
   * Plaintext token for authorized display/print when recoverable.
   * Null when NONE, REVOKED, or legacy unrecoverable ACTIVE.
   */
  token: string | null;
}

async function locateUnit(
  properties: IPropertyRepository,
  tenantId: string,
  unitId: string,
): Promise<{
  propertyId: string;
  propertyName: string;
  unitName: string;
} | null> {
  const catalog = await properties.listUnitCatalog(tenantId);
  for (const property of catalog.properties) {
    const unit = property.units.find((u) => u.id === unitId);
    if (unit) {
      return {
        propertyId: property.id,
        propertyName: property.name,
        unitName: unit.name,
      };
    }
  }
  return null;
}

function recoverToken(
  record: UnitQrAccessRecord | null,
  sealer: IHousekeepingQrTokenSealer,
): { token: string | null; recoverable: boolean } {
  if (!record || record.status !== "ACTIVE") {
    return { token: null, recoverable: false };
  }
  if (
    record.tokenCiphertext == null ||
    record.tokenCiphertext.length === 0 ||
    record.tokenKeyVersion == null
  ) {
    return { token: null, recoverable: false };
  }
  const token = sealer.unseal(
    record.tokenCiphertext,
    record.tokenKeyVersion,
  );
  return { token, recoverable: true };
}

function toView(
  record: UnitQrAccessRecord | null,
  location: { propertyId: string; propertyName: string; unitName: string },
  unitId: string,
  token: string | null,
  recoverable: boolean,
): UnitQrView {
  return {
    unitId,
    propertyId: location.propertyId,
    unitName: location.unitName,
    propertyName: location.propertyName,
    status: record ? record.status : "NONE",
    createdAt: record?.createdAt ?? null,
    rotatedAt: record?.rotatedAt ?? null,
    recoverable,
    token,
  };
}

export class GetUnitQrUseCase {
  constructor(
    private readonly qrAccess: IUnitQrAccessRepository,
    private readonly properties: IPropertyRepository,
    private readonly sealer: IHousekeepingQrTokenSealer,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; unitId: string },
    actor: ActorContext,
  ): Promise<Result<UnitQrView, Error>> {
    try {
      const location = await locateUnit(
        this.properties,
        input.tenantId,
        input.unitId,
      );
      if (!location) {
        return Result.fail(new NotFoundError("Unit", input.unitId));
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

      const record = await this.qrAccess.findActiveByUnit(
        input.tenantId,
        input.unitId,
      );
      const recovered = recoverToken(record, this.sealer);
      return Result.ok(
        toView(
          record,
          location,
          input.unitId,
          recovered.token,
          recovered.recoverable,
        ),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/**
 * Mints a code when the unit has none. If an ACTIVE code already exists it is
 * returned (recovered when sealed) — only `RotateUnitQrUseCase` replaces it.
 */
export class GenerateUnitQrUseCase {
  constructor(
    private readonly qrAccess: IUnitQrAccessRepository,
    private readonly properties: IPropertyRepository,
    private readonly tokens: IOpaqueTokenFactory,
    private readonly sealer: IHousekeepingQrTokenSealer,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
    private readonly cleaningLocations?: ICleaningLocationRepository,
  ) {}

  async execute(
    input: { tenantId: string; unitId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<UnitQrView, Error>> {
    try {
      const location = await locateUnit(
        this.properties,
        input.tenantId,
        input.unitId,
      );
      if (!location) {
        return Result.fail(new NotFoundError("Unit", input.unitId));
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

      // Public staff QR flow requires a CleaningLocation linked to the unit.
      await this.cleaningLocations?.ensureActiveLinkedToCommercialUnit({
        tenantId: input.tenantId,
        propertyId: location.propertyId,
        unitId: input.unitId,
        preferredName: location.unitName,
      });

      const minted = this.tokens.create();
      const sealed = this.sealer.seal(minted.token);
      const { record, issued } = await this.qrAccess.issue({
        tenantId: input.tenantId,
        propertyId: location.propertyId,
        unitId: input.unitId,
        tokenHash: minted.tokenHash,
        tokenCiphertext: sealed.ciphertext,
        tokenKeyVersion: sealed.keyVersion,
        rotate: false,
      });

      if (issued) {
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "unit_qr.generated",
          resourceType: "unit_qr_access",
          resourceId: record.id,
          metadata: { unitId: input.unitId, propertyId: location.propertyId },
          ipAddress: auditContext?.ipAddress ?? null,
        });
        return Result.ok(
          toView(record, location, input.unitId, minted.token, true),
        );
      }

      const recovered = recoverToken(record, this.sealer);
      return Result.ok(
        toView(
          record,
          location,
          input.unitId,
          recovered.token,
          recovered.recoverable,
        ),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class RotateUnitQrUseCase {
  constructor(
    private readonly qrAccess: IUnitQrAccessRepository,
    private readonly properties: IPropertyRepository,
    private readonly tokens: IOpaqueTokenFactory,
    private readonly sealer: IHousekeepingQrTokenSealer,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; unitId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<UnitQrView, Error>> {
    try {
      const location = await locateUnit(
        this.properties,
        input.tenantId,
        input.unitId,
      );
      if (!location) {
        return Result.fail(new NotFoundError("Unit", input.unitId));
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

      const minted = this.tokens.create();
      const sealed = this.sealer.seal(minted.token);
      const { record } = await this.qrAccess.issue({
        tenantId: input.tenantId,
        propertyId: location.propertyId,
        unitId: input.unitId,
        tokenHash: minted.tokenHash,
        tokenCiphertext: sealed.ciphertext,
        tokenKeyVersion: sealed.keyVersion,
        rotate: true,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "unit_qr.rotated",
        resourceType: "unit_qr_access",
        resourceId: record.id,
        metadata: { unitId: input.unitId, propertyId: location.propertyId },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(
        toView(record, location, input.unitId, minted.token, true),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface ResolvedUnitQr {
  unitId: string;
  propertyId: string;
  unitName: string;
  propertyName: string;
}

/**
 * Exchanges a scanned token for unit identity. Authentication is enforced by
 * the caller; this adds the tenant scope and property ACL.
 */
export class ResolveUnitQrUseCase {
  constructor(
    private readonly qrAccess: IUnitQrAccessRepository,
    private readonly properties: IPropertyRepository,
    private readonly tokens: IOpaqueTokenFactory,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; token: string },
    actor: ActorContext,
  ): Promise<Result<ResolvedUnitQr, Error>> {
    try {
      const token = input.token.trim();
      if (!/^[0-9a-f]{64}$/i.test(token)) {
        return Result.fail(new ValidationError("Invalid QR token"));
      }

      const record = await this.qrAccess.findActiveByTokenHash(
        input.tenantId,
        this.tokens.hash(token),
      );
      if (!record) {
        return Result.fail(new NotFoundError("Unit QR", "token"));
      }
      if (
        !canReadCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          record.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const location = await locateUnit(
        this.properties,
        input.tenantId,
        record.unitId,
      );
      if (!location) {
        return Result.fail(new NotFoundError("Unit", record.unitId));
      }

      return Result.ok({
        unitId: record.unitId,
        propertyId: location.propertyId,
        unitName: location.unitName,
        propertyName: location.propertyName,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
