import { Result } from "../../shared/kernel/Result";
import { NotFoundError } from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { Tenant } from "../domain/Tenant";
import type { ITenantRepository } from "../ports/ITenantRepository";

export class SuspendTenantUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    tenantId: string,
    reason: string | undefined,
    audit: UseCaseAuditContext,
  ): Promise<Result<Tenant, Error>> {
    try {
      const tenant = await this.tenantRepository.findById(tenantId);
      if (!tenant) {
        return Result.fail(new NotFoundError("Tenant", tenantId));
      }

      tenant.suspend(reason);
      await this.tenantRepository.save(tenant);

      await this.auditLogRepository.append({
        tenantId,
        actorId: audit.actorId,
        action: "tenant.suspend",
        resourceType: "Tenant",
        resourceId: tenantId,
        metadata: { reason: reason ?? null },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(tenant);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ActivateTenantUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    tenantId: string,
    audit: UseCaseAuditContext,
  ): Promise<Result<Tenant, Error>> {
    try {
      const tenant = await this.tenantRepository.findById(tenantId);
      if (!tenant) {
        return Result.fail(new NotFoundError("Tenant", tenantId));
      }

      tenant.activate();
      await this.tenantRepository.save(tenant);

      await this.auditLogRepository.append({
        tenantId,
        actorId: audit.actorId,
        action: "tenant.activate",
        resourceType: "Tenant",
        resourceId: tenantId,
        metadata: {},
        ipAddress: audit.ipAddress,
      });

      return Result.ok(tenant);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
