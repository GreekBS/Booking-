import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type {
  CreatePublishableKeyResult,
  IPublishableKeyRepository,
  PublishableKeyListItem,
} from "../ports/StorefrontPorts";

export function validateAllowedDomains(domains: string[]): void {
  if (domains.length === 0) {
    return;
  }

  for (const domain of domains) {
    if (domain === "*") {
      continue;
    }
    if (domain.startsWith("*.")) {
      const host = domain.slice(2);
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
        throw new ValidationError(`Invalid allowed domain pattern: ${domain}`);
      }
      continue;
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) && !domain.includes("localhost")) {
      throw new ValidationError(`Invalid allowed domain: ${domain}`);
    }
  }
}

export class ListPublishableKeysUseCase {
  constructor(
    private readonly publishableKeyRepository: IPublishableKeyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<PublishableKeyListItem[], Error>> {
    try {
      if (!this.permissionChecker.hasPermission(actor, PERMISSIONS.KEY_READ, tenantId)) {
        return Result.fail(new ForbiddenError());
      }

      const keys = await this.publishableKeyRepository.listByTenant(tenantId);
      return Result.ok(keys);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface CreatePublishableKeyCommand {
  tenantId: string;
  environment: "test" | "live";
  allowedDomains?: string[];
  rawKey: string;
}

export class CreatePublishableKeyUseCase {
  constructor(
    private readonly publishableKeyRepository: IPublishableKeyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: CreatePublishableKeyCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<CreatePublishableKeyResult, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, PERMISSIONS.KEY_CREATE, command.tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const allowedDomains = command.allowedDomains ?? (command.environment === "test" ? ["*"] : []);
      validateAllowedDomains(allowedDomains);

      const created = await this.publishableKeyRepository.create({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        rawKey: command.rawKey,
        environment: command.environment,
        allowedDomains,
      });

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: audit.actorId,
        action: "publishable_key.created",
        resourceType: "TenantPublishableKey",
        resourceId: created.id,
        metadata: {
          environment: command.environment,
          allowedDomains,
        },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(created);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface RevokePublishableKeyCommand {
  tenantId: string;
  keyId: string;
}

export class RevokePublishableKeyUseCase {
  constructor(
    private readonly publishableKeyRepository: IPublishableKeyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: RevokePublishableKeyCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<void, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, PERMISSIONS.KEY_REVOKE, command.tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const key = await this.publishableKeyRepository.findById(command.keyId, command.tenantId);
      if (!key || !key.isActive) {
        return Result.fail(new ValidationError("Publishable key not found"));
      }

      await this.publishableKeyRepository.revoke(command.keyId, command.tenantId);

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: audit.actorId,
        action: "publishable_key.revoked",
        resourceType: "TenantPublishableKey",
        resourceId: command.keyId,
        metadata: {},
        ipAddress: audit.ipAddress,
      });

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface UpdatePublishableKeyDomainsCommand {
  tenantId: string;
  keyId: string;
  allowedDomains: string[];
}

export class UpdatePublishableKeyDomainsUseCase {
  constructor(
    private readonly publishableKeyRepository: IPublishableKeyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: UpdatePublishableKeyDomainsCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<PublishableKeyListItem, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, PERMISSIONS.KEY_UPDATE, command.tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      validateAllowedDomains(command.allowedDomains);

      const key = await this.publishableKeyRepository.findById(command.keyId, command.tenantId);
      if (!key || !key.isActive) {
        return Result.fail(new ValidationError("Publishable key not found"));
      }

      if (key.environment === "live" && command.allowedDomains.length === 0) {
        return Result.fail(new ValidationError("Live keys require at least one allowed domain"));
      }

      const updated = await this.publishableKeyRepository.updateAllowedDomains(
        command.keyId,
        command.tenantId,
        command.allowedDomains,
      );

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: audit.actorId,
        action: "publishable_key.domains_updated",
        resourceType: "TenantPublishableKey",
        resourceId: command.keyId,
        metadata: { allowedDomains: command.allowedDomains },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(updated);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
