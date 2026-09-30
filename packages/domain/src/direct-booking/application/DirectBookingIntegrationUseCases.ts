import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import type {
  CreateDirectBookingIntegrationResult,
  DirectBookingEnvironment,
  DirectBookingIntegrationRecord,
  DirectBookingIntegrationStatus,
  IDirectBookingIntegrationRepository,
} from "../ports/DirectBookingPorts";

export interface CreateDirectBookingIntegrationCommand {
  tenantId: string;
  propertyId: string;
  /** Optional; defaults to the property's sole active commercial unit when omitted. */
  unitId?: string;
  environment: DirectBookingEnvironment;
  allowedOrigins: string[];
  status?: DirectBookingIntegrationStatus;
}

export class CreateDirectBookingIntegrationUseCase {
  constructor(
    private readonly integrations: IDirectBookingIntegrationRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly generatePublicKey: (
      environment: DirectBookingEnvironment,
    ) => { rawKey: string },
  ) {}

  async execute(
    command: CreateDirectBookingIntegrationCommand,
    actor: ActorContext,
  ): Promise<Result<CreateDirectBookingIntegrationResult, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.PROPERTY_UPDATE_TENANT,
          command.tenantId,
        ) &&
        !this.permissionChecker.canAccessProperty(
          actor,
          command.tenantId,
          command.propertyId,
          "property:update",
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const property = await this.properties.findById(
        command.tenantId,
        command.propertyId,
      );
      if (!property || property.deletedAt) {
        return Result.fail(new NotFoundError("Property", command.propertyId));
      }

      const activeUnits = property.units.filter((u) => u.deletedAt === null);
      if (activeUnits.length === 0) {
        return Result.fail(new ValidationError("Property has no commercial units"));
      }

      let unitId = command.unitId;
      if (!unitId) {
        if (activeUnits.length !== 1) {
          return Result.fail(
            new ValidationError("unitId is required when property has multiple units"),
          );
        }
        unitId = activeUnits[0]!.id;
      } else {
        const match = activeUnits.find((u) => u.id === unitId);
        if (!match) {
          return Result.fail(new NotFoundError("Unit", unitId));
        }
      }

      const origins = normalizeAllowedOrigins(command.allowedOrigins);
      const { rawKey } = this.generatePublicKey(command.environment);

      const created = await this.integrations.create({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        propertyId: command.propertyId,
        unitId,
        rawPublicKey: rawKey,
        environment: command.environment,
        allowedOrigins: origins,
        status: command.status ?? "draft",
      });

      return Result.ok(created);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface UpdateDirectBookingIntegrationStatusCommand {
  tenantId: string;
  integrationId: string;
  status: DirectBookingIntegrationStatus;
}

export class UpdateDirectBookingIntegrationStatusUseCase {
  constructor(
    private readonly integrations: IDirectBookingIntegrationRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: UpdateDirectBookingIntegrationStatusCommand,
    actor: ActorContext,
  ): Promise<Result<DirectBookingIntegrationRecord, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.PROPERTY_UPDATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const existing = await this.integrations.findById(
        command.integrationId,
        command.tenantId,
      );
      if (!existing) {
        return Result.fail(new NotFoundError("DirectBookingIntegration", command.integrationId));
      }

      const updated = await this.integrations.updateStatus(
        command.integrationId,
        command.tenantId,
        command.status,
      );
      return Result.ok(updated);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function normalizeAllowedOrigins(origins: string[]): string[] {
  const cleaned = origins
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return [...new Set(cleaned)];
}
