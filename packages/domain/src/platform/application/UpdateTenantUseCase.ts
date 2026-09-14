import { Result } from "../../shared/kernel/Result";
import { TenantSettings, type DateFormat, type TimeFormat } from "../../shared/value-objects/Policies";
import { ValidationError } from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { Tenant } from "../domain/Tenant";
import type { ITenantRepository } from "../ports/ITenantRepository";

export interface UpdateTenantCommand {
  tenantId: string;
  name?: string;
  timezone?: string;
  defaultLocale?: string;
  defaultCurrency?: string;
  dateFormat?: DateFormat;
  timeFormat?: TimeFormat;
}

export class UpdateTenantUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: UpdateTenantCommand,
    audit: UseCaseAuditContext,
  ): Promise<Result<Tenant, Error>> {
    try {
      const tenant = await this.tenantRepository.findById(command.tenantId);
      if (!tenant) {
        return Result.fail(new ValidationError("Tenant not found"));
      }

      if (command.name !== undefined) {
        tenant.updateName(command.name);
      }

      if (
        command.timezone !== undefined ||
        command.defaultLocale !== undefined ||
        command.defaultCurrency !== undefined ||
        command.dateFormat !== undefined ||
        command.timeFormat !== undefined
      ) {
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
      }

      await this.tenantRepository.save(tenant);

      await this.auditLogRepository.append({
        tenantId: tenant.id,
        actorId: audit.actorId,
        action: "tenant.update",
        resourceType: "Tenant",
        resourceId: tenant.id,
        metadata: {
          name: command.name,
          timezone: command.timezone,
          defaultLocale: command.defaultLocale,
          defaultCurrency: command.defaultCurrency,
          dateFormat: command.dateFormat,
          timeFormat: command.timeFormat,
        },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(tenant);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
