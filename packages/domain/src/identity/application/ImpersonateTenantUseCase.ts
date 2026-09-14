import { Result } from "../../shared/kernel/Result";
import { ForbiddenError } from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { ISessionRepository } from "../ports/ISessionRepository";
import type { ITenantRepository } from "../../platform/ports/ITenantRepository";

export class ImpersonateTenantUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly sessionRepository: ISessionRepository,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    userId: string,
    tenantId: string,
    audit: UseCaseAuditContext,
  ): Promise<Result<{ tenantId: string }, Error>> {
    try {
      const tenant = await this.tenantRepository.findById(tenantId);
      if (!tenant) {
        return Result.fail(new ForbiddenError("Tenant not found"));
      }

      await this.sessionRepository.setActiveTenant(userId, tenantId);

      await this.auditLogRepository.append({
        tenantId,
        actorId: audit.actorId,
        action: "tenant.impersonate",
        resourceType: "Tenant",
        resourceId: tenantId,
        metadata: {},
        ipAddress: audit.ipAddress,
      });

      return Result.ok({ tenantId });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
