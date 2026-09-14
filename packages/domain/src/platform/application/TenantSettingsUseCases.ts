import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import { TenantSettings, type DateFormat, type TimeFormat } from "../../shared/value-objects/Policies";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { ITenantRepository } from "../ports/ITenantRepository";

export interface TenantSettingsView {
  timezone: string;
  defaultLocale: string;
  defaultCurrency: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

export class GetTenantSettingsUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<TenantSettingsView, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, PERMISSIONS.TENANT_READ, tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const tenant = await this.tenantRepository.findById(tenantId);
      if (!tenant) {
        return Result.fail(new ValidationError("Tenant not found"));
      }

      const settings = tenant.settings;
      return Result.ok({
        timezone: settings.timezone,
        defaultLocale: settings.defaultLocale,
        defaultCurrency: settings.defaultCurrency,
        dateFormat: settings.dateFormat,
        timeFormat: settings.timeFormat,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface UpdateTenantSettingsCommand {
  tenantId: string;
  timezone?: string;
  defaultLocale?: string;
  defaultCurrency?: string;
  dateFormat?: DateFormat;
  timeFormat?: TimeFormat;
}

export class UpdateTenantSettingsUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: UpdateTenantSettingsCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<TenantSettingsView, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.TENANT_UPDATE,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const tenant = await this.tenantRepository.findById(command.tenantId);
      if (!tenant) {
        return Result.fail(new ValidationError("Tenant not found"));
      }

      const current = tenant.settings;
      tenant.updateSettings(
        TenantSettings.create({
          timezone: command.timezone ?? current.timezone,
          defaultLocale: command.defaultLocale ?? current.defaultLocale,
          defaultCurrency: command.defaultCurrency ?? current.defaultCurrency,
          dateFormat: command.dateFormat ?? current.dateFormat,
          timeFormat: command.timeFormat ?? current.timeFormat,
        }),
      );

      await this.tenantRepository.save(tenant);

      await this.auditLogRepository.append({
        tenantId: tenant.id,
        actorId: audit.actorId,
        action: "tenant.settings_updated",
        resourceType: "Tenant",
        resourceId: tenant.id,
        metadata: {
          timezone: command.timezone,
          defaultLocale: command.defaultLocale,
          defaultCurrency: command.defaultCurrency,
          dateFormat: command.dateFormat,
          timeFormat: command.timeFormat,
        },
        ipAddress: audit.ipAddress,
      });

      const settings = tenant.settings;
      return Result.ok({
        timezone: settings.timezone,
        defaultLocale: settings.defaultLocale,
        defaultCurrency: settings.defaultCurrency,
        dateFormat: settings.dateFormat,
        timeFormat: settings.timeFormat,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
