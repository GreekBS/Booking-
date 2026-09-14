import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type {
  CommerceSettingsReadModel,
  ICommerceSettingsRepository,
} from "../ports/CommercePorts";

export class GetCommerceSettingsUseCase {
  constructor(
    private readonly commerceSettingsRepository: ICommerceSettingsRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<CommerceSettingsReadModel, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, PERMISSIONS.COMMERCE_READ, tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const settings = await this.commerceSettingsRepository.findByTenantId(tenantId);
      if (!settings) {
        return Result.fail(new ValidationError("Commerce settings not found"));
      }

      return Result.ok(settings);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface UpdateCommerceSettingsCommand {
  tenantId: string;
  defaultHoldTtlSeconds?: number;
  confirmationMode?: "manual" | "payment_required";
  defaultCurrency?: string;
}

export class UpdateCommerceSettingsUseCase {
  constructor(
    private readonly commerceSettingsRepository: ICommerceSettingsRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: UpdateCommerceSettingsCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<CommerceSettingsReadModel, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.COMMERCE_UPDATE,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const current = await this.commerceSettingsRepository.findByTenantId(command.tenantId);
      if (!current) {
        return Result.fail(new ValidationError("Commerce settings not found"));
      }

      const updated = await this.commerceSettingsRepository.update(command.tenantId, {
        defaultHoldTtlSeconds:
          command.defaultHoldTtlSeconds ?? current.defaultHoldTtlSeconds,
        confirmationMode: command.confirmationMode ?? current.confirmationMode,
        defaultCurrency: command.defaultCurrency ?? current.defaultCurrency,
      });

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: audit.actorId,
        action: "commerce.settings_updated",
        resourceType: "TenantCommerceSettings",
        resourceId: command.tenantId,
        metadata: {
          defaultHoldTtlSeconds: command.defaultHoldTtlSeconds,
          confirmationMode: command.confirmationMode,
          defaultCurrency: command.defaultCurrency,
        },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(updated);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
