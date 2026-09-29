import { Result } from "../../shared/kernel/Result";
import { ForbiddenError } from "../../shared/errors/DomainError";
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
        // Idempotent backfill for tenants created before commerce defaults on create.
        const ensured = await this.commerceSettingsRepository.ensureDefaults(tenantId);
        return Result.ok(ensured);
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

      let current = await this.commerceSettingsRepository.findByTenantId(command.tenantId);
      if (!current) {
        current = await this.commerceSettingsRepository.ensureDefaults(command.tenantId);
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
