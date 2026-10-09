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
import type { IPasswordHasher } from "../../../identity/ports/AuthPorts";
import type { IPropertyRepository } from "../../../catalog/ports/ICatalogRepositories";
import { assertSafeWebsiteRedirectUrl } from "../../../catalog/domain/propertyWebsiteUrl";
import type { IOpaqueTokenFactory } from "../ports/IOpaqueTokenFactory";
import type { ICleaningLocationRepository } from "../ports/ICleaningLocationRepository";
import type { IUnitHousekeepingStatusRepository } from "../../ports/IUnitHousekeepingStatusRepository";
import type {
  IPublicCleaningQrLookup,
  IPropertyStaffPinRepository,
  ITenantTransactionRunner,
  StaffHousekeepingStatusView,
} from "../ports/IPublicQrStaffPorts";
import type {
  HkStaffCapabilityClaims,
  IHkStaffCapabilitySigner,
} from "../domain/HkStaffCapability";
import { HK_STAFF_AUDIT_ACTOR_TYPE } from "../domain/HkStaffCapability";
import { canManageCleaningConfigOnProperty } from "./cleaningAccess";

export const STAFF_PIN_MAX_ATTEMPTS = 5;
export const STAFF_PIN_LOCKOUT_MS = 15 * 60 * 1000;

export type PublicQrRouteDecision =
  | {
      kind: "redirect_website";
      websiteUrl: string;
      propertyId: string;
      propertyName: string;
    }
  | {
      kind: "staff_pin";
      propertyId: string;
      propertyName: string;
      pinConfigured: boolean;
    };

export interface ResolvedPublicQrIdentity {
  kind: "location" | "unit";
  qrAccessId: string;
  tenantId: string;
  propertyId: string;
  propertyName: string;
  unitId: string | null;
  locationId: string;
  locationName: string;
  tokenHash: string;
  websiteUrl: string | null;
  pinConfigured: boolean;
}

/**
 * Public QR resolve — no Auth.js / no tenant header.
 * Token hash lookup via SECURITY DEFINER; PIN required before any mutation.
 */
export class ResolvePublicQrRouteUseCase {
  constructor(
    private readonly tokens: IOpaqueTokenFactory,
    private readonly lookup: IPublicCleaningQrLookup,
    private readonly staffPin: IPropertyStaffPinRepository,
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
  ) {}

  async execute(input: {
    token: string;
  }): Promise<Result<{ identity: ResolvedPublicQrIdentity; route: PublicQrRouteDecision }, Error>> {
    try {
      const identity = await this.resolveIdentity(input.token);
      if (identity.isFailure) {
        return Result.fail(identity.getError());
      }
      const id = identity.getValue();

      if (id.websiteUrl) {
        const safe = assertSafeWebsiteRedirectUrl(id.websiteUrl);
        return Result.ok({
          identity: id,
          route: {
            kind: "redirect_website",
            websiteUrl: safe,
            propertyId: id.propertyId,
            propertyName: id.propertyName,
          },
        });
      }

      return Result.ok({
        identity: id,
        route: {
          kind: "staff_pin",
          propertyId: id.propertyId,
          propertyName: id.propertyName,
          pinConfigured: id.pinConfigured,
        },
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async resolveIdentity(
    rawToken: string,
  ): Promise<Result<ResolvedPublicQrIdentity, Error>> {
    const token = rawToken.trim();
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      return Result.fail(new NotFoundError("Cleaning QR", "token"));
    }
    const tokenHash = this.tokens.hash(token);
    const row = await this.lookup.findActiveByTokenHash(tokenHash);
    if (!row) {
      return Result.fail(new NotFoundError("Cleaning QR", "token"));
    }

    const meta = await this.staffPin.getPublicMeta(row.tenantId, row.propertyId);
    if (!meta) {
      return Result.fail(new NotFoundError("Property", row.propertyId));
    }

    let location =
      row.cleaningLocationId != null
        ? await this.locations.findById(row.tenantId, row.cleaningLocationId)
        : null;

    // Legacy unit QR: lookup LEFT JOINs by commercialUnitId — may be null when
    // no linked CleaningLocation exists. Resolve by link, or ensure one linked
    // location for this commercial unit (idempotent; no inventory side effects).
    if ((!location || location.status !== "active") && row.unitId) {
      location = await this.locations.findActiveByCommercialUnit(
        row.tenantId,
        row.unitId,
      );
      if (!location) {
        const property = await this.properties.findById(
          row.tenantId,
          row.propertyId,
        );
        const unit = property?.units.find((u) => u.id === row.unitId);
        if (!property || !unit) {
          return Result.fail(new NotFoundError("Unit", row.unitId));
        }
        const ensured = await this.locations.ensureActiveLinkedToCommercialUnit({
          tenantId: row.tenantId,
          propertyId: row.propertyId,
          unitId: row.unitId,
          preferredName: unit.name,
        });
        location = ensured.location;
      }
    }

    if (!location || location.status !== "active") {
      return Result.fail(
        new NotFoundError(
          "Cleaning location",
          row.cleaningLocationId ?? row.unitId ?? "unknown",
        ),
      );
    }

    return Result.ok({
      kind: row.kind,
      qrAccessId: row.qrAccessId,
      tenantId: row.tenantId,
      propertyId: row.propertyId,
      propertyName: meta.propertyName,
      unitId: row.unitId ?? location.commercialUnitId,
      locationId: location.id,
      locationName: location.name,
      tokenHash,
      websiteUrl: meta.websiteUrl,
      pinConfigured: meta.pinConfigured,
    });
  }
}

export class SetPropertyStaffPinUseCase {
  constructor(
    private readonly staffPin: IPropertyStaffPinRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; propertyId: string; pin: string },
    actor: ActorContext,
    ctx?: { ipAddress?: string | null },
  ): Promise<Result<{ pinConfigured: true }, Error>> {
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

      if (!/^\d{4,8}$/.test(input.pin)) {
        return Result.fail(new ValidationError("Staff PIN must be 4–8 digits"));
      }

      const existing = await this.staffPin.getForProperty(
        input.tenantId,
        input.propertyId,
      );
      if (!existing) {
        return Result.fail(new NotFoundError("Property", input.propertyId));
      }

      const pinHash = await this.passwordHasher.hash(input.pin);
      await this.staffPin.setPinHash(input.tenantId, input.propertyId, pinHash);

      if (this.audit) {
        await this.audit.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "housekeeping.staff_pin_set",
          resourceType: "property",
          resourceId: input.propertyId,
          ipAddress: ctx?.ipAddress ?? null,
          metadata: {},
        });
      }

      return Result.ok({ pinConfigured: true });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class UnlockHousekeepingStaffUseCase {
  constructor(
    private readonly resolvePublic: ResolvePublicQrRouteUseCase,
    private readonly staffPin: IPropertyStaffPinRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly capability: IHkStaffCapabilitySigner,
  ) {}

  async execute(input: {
    token: string;
    pin: string;
    now?: Date;
  }): Promise<
    Result<
      {
        capabilityToken: string;
        claims: HkStaffCapabilityClaims;
        identity: ResolvedPublicQrIdentity;
      },
      Error
    >
  > {
    try {
      const identityResult = await this.resolvePublic.resolveIdentity(input.token);
      if (identityResult.isFailure) {
        return Result.fail(identityResult.getError());
      }
      const identity = identityResult.getValue();
      const now = input.now ?? new Date();

      const record = await this.staffPin.getForProperty(
        identity.tenantId,
        identity.propertyId,
      );
      if (!record || !record.pinHash) {
        return Result.fail(new ValidationError("Staff PIN is not configured"));
      }

      if (record.lockedUntil && record.lockedUntil.getTime() > now.getTime()) {
        return Result.fail(new ForbiddenError("Staff PIN temporarily locked"));
      }

      const ok = await this.passwordHasher.compare(input.pin, record.pinHash);
      if (!ok) {
        const failedAttempts = record.failedAttempts + 1;
        const lockedUntil =
          failedAttempts >= STAFF_PIN_MAX_ATTEMPTS
            ? new Date(now.getTime() + STAFF_PIN_LOCKOUT_MS)
            : null;
        await this.staffPin.recordFailedAttempt(
          identity.tenantId,
          identity.propertyId,
          {
            failedAttempts: lockedUntil ? 0 : failedAttempts,
            lockedUntil,
          },
        );
        return Result.fail(new ForbiddenError("Invalid staff PIN"));
      }

      await this.staffPin.clearFailures(identity.tenantId, identity.propertyId);

      const issued = this.capability.issue({
        tenantId: identity.tenantId,
        propertyId: identity.propertyId,
        locationId: identity.locationId,
        unitId: identity.unitId,
        qrAccessId: identity.qrAccessId,
        tokenHash: identity.tokenHash,
        now,
      });

      return Result.ok({
        capabilityToken: issued.token,
        claims: issued.claims,
        identity,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetStaffHousekeepingStatusUseCase {
  constructor(
    private readonly locations: ICleaningLocationRepository,
    private readonly properties: IPropertyRepository,
    private readonly lookup: IPublicCleaningQrLookup,
    private readonly staffPin: IPropertyStaffPinRepository,
  ) {}

  async execute(input: {
    claims: HkStaffCapabilityClaims;
  }): Promise<Result<StaffHousekeepingStatusView, Error>> {
    try {
      await this.assertCapabilityStillValid(input.claims);

      const location = await this.locations.findById(
        input.claims.tenantId,
        input.claims.locationId,
      );
      if (!location || location.status !== "active") {
        return Result.fail(new NotFoundError("Cleaning location", input.claims.locationId));
      }
      if (location.propertyId !== input.claims.propertyId) {
        return Result.fail(new ForbiddenError());
      }

      const statusRow = await this.locations.ensureStatusInitialized({
        tenantId: input.claims.tenantId,
        propertyId: input.claims.propertyId,
        locationId: input.claims.locationId,
      });

      const property = await this.properties.findById(
        input.claims.tenantId,
        input.claims.propertyId,
      );
      if (!property) {
        return Result.fail(new NotFoundError("Property", input.claims.propertyId));
      }

      let unitName: string | null = null;
      if (input.claims.unitId) {
        const unit = property.units.find((u) => u.id === input.claims.unitId);
        unitName = unit?.name ?? null;
      }

      return Result.ok({
        tenantId: input.claims.tenantId,
        propertyId: input.claims.propertyId,
        propertyName: property.name,
        locationId: location.id,
        locationName: location.name,
        unitId: input.claims.unitId,
        unitName,
        status: statusRow.status,
        version: statusRow.version,
        updatedAt: statusRow.updatedAt,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async assertCapabilityStillValid(
    claims: HkStaffCapabilityClaims,
  ): Promise<void> {
    const row = await this.lookup.findActiveByTokenHash(claims.tokenHash);
    if (
      !row ||
      row.qrAccessId !== claims.qrAccessId ||
      row.tenantId !== claims.tenantId ||
      row.propertyId !== claims.propertyId
    ) {
      throw new ForbiddenError("Housekeeping capability is no longer valid");
    }
    // Unit QR lookup may return null location until JOIN sees the link; accept
    // an explicit linked location for the same commercial unit.
    const locationMatches =
      (row.cleaningLocationId ?? "") === claims.locationId ||
      (row.unitId != null &&
        row.cleaningLocationId == null &&
        (
          await this.locations.findActiveByCommercialUnit(
            claims.tenantId,
            row.unitId,
          )
        )?.id === claims.locationId);
    if (!locationMatches) {
      throw new ForbiddenError("Housekeeping capability is no longer valid");
    }

    const pin = await this.staffPin.getForProperty(claims.tenantId, claims.propertyId);
    if (!pin?.pinHash) {
      throw new ForbiddenError("Staff PIN is not configured");
    }
    if (pin.updatedAt && Math.floor(pin.updatedAt.getTime() / 1000) > claims.iat) {
      throw new ForbiddenError("Staff PIN was rotated — unlock again");
    }
  }
}

export class MarkStaffHousekeepingStatusUseCase {
  constructor(
    private readonly locations: ICleaningLocationRepository,
    private readonly unitHousekeeping: IUnitHousekeepingStatusRepository,
    private readonly getStatus: GetStaffHousekeepingStatusUseCase,
    private readonly lookup: IPublicCleaningQrLookup,
    private readonly audit?: IAuditLogRepository,
    /**
     * When provided, location + linked unit + audit commit atomically.
     * Required in Production DI so audit failure cannot leave a committed mark.
     */
    private readonly transactions?: ITenantTransactionRunner,
  ) {}

  async execute(input: {
    claims: HkStaffCapabilityClaims;
    target: "CLEAN" | "DIRTY";
    expectedVersion: number;
  }): Promise<Result<StaffHousekeepingStatusView, Error>> {
    try {
      // Reuses getStatus capability checks (QR ACTIVE + PIN not rotated).
      const gate = await this.getStatus.execute({ claims: input.claims });
      if (gate.isFailure) {
        return Result.fail(gate.getError());
      }

      const row = await this.lookup.findActiveByTokenHash(input.claims.tokenHash);
      if (!row || row.qrAccessId !== input.claims.qrAccessId) {
        return Result.fail(new ForbiddenError("Housekeeping capability is no longer valid"));
      }
      const locationMatches =
        row.cleaningLocationId === input.claims.locationId ||
        (row.unitId != null &&
          row.cleaningLocationId == null &&
          (
            await this.locations.findActiveByCommercialUnit(
              input.claims.tenantId,
              row.unitId,
            )
          )?.id === input.claims.locationId);
      if (!locationMatches) {
        return Result.fail(new ForbiddenError("Housekeeping capability is no longer valid"));
      }

      const runMutation = async (): Promise<void> => {
        const previous = await this.locations.ensureStatusInitialized({
          tenantId: input.claims.tenantId,
          propertyId: input.claims.propertyId,
          locationId: input.claims.locationId,
        });

        if (input.target === "CLEAN") {
          await this.locations.markClean({
            tenantId: input.claims.tenantId,
            locationId: input.claims.locationId,
            expectedVersion: input.expectedVersion,
            source: "QR_STAFF",
            updatedByUserId: null,
          });
        } else {
          await this.locations.markDirty({
            tenantId: input.claims.tenantId,
            locationId: input.claims.locationId,
            expectedVersion: input.expectedVersion,
            source: "QR_STAFF",
            updatedByUserId: null,
          });
        }

        // Keep commercial unit readiness in sync when linked.
        if (input.claims.unitId) {
          const unitStatus = await this.unitHousekeeping.ensureInitialized({
            tenantId: input.claims.tenantId,
            propertyId: input.claims.propertyId,
            unitId: input.claims.unitId,
          });
          const expectedUnitVersion = unitStatus.version;
          if (input.target === "CLEAN") {
            unitStatus.markClean(expectedUnitVersion, "QR_STAFF", null);
          } else {
            unitStatus.markDirty(expectedUnitVersion, "QR_STAFF", null);
          }
          await this.unitHousekeeping.saveWithExpectedVersion(
            unitStatus,
            expectedUnitVersion,
          );
        }

        if (this.audit) {
          await this.audit.append({
            tenantId: input.claims.tenantId,
            // Truthful capability actor: no Auth.js user — identity in metadata.
            actorId: null,
            action:
              input.target === "CLEAN"
                ? "housekeeping.marked_clean"
                : "housekeeping.marked_dirty",
            resourceType: "cleaning_location_status",
            resourceId: input.claims.locationId,
            ipAddress: null,
            metadata: {
              actorType: HK_STAFF_AUDIT_ACTOR_TYPE,
              source: "QR_STAFF",
              previousStatus: previous.status,
              newStatus: input.target,
              qrAccessId: input.claims.qrAccessId,
              unitId: input.claims.unitId,
              propertyId: input.claims.propertyId,
            },
          });
        }
      };

      if (this.transactions) {
        await this.transactions.runInTenantTransaction(
          input.claims.tenantId,
          runMutation,
        );
      } else {
        await runMutation();
      }

      return this.getStatus.execute({ claims: input.claims });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
