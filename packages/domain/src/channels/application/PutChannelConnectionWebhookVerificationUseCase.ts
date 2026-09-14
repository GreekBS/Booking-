import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelCredentialStore } from "../ports/IChannelCredentialStore";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import {
  toChannelConnectionOperatorReadModel,
  type ChannelConnectionOperatorReadModel,
} from "./ChannelConnectionOperatorReadModel";

export interface PutChannelConnectionWebhookVerificationCommand {
  tenantId: string;
  connectionId: string;
  secret: string;
  now?: Date;
}

const MAX_SECRET_LENGTH = 4096;

/**
 * Seal webhook verification secret and attach opaque reference.
 * Never logs or audits the secret.
 */
export class PutChannelConnectionWebhookVerificationUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly credentialStore: IChannelCredentialStore,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLog: IAuditLogRepository,
  ) {}

  async execute(
    command: PutChannelConnectionWebhookVerificationCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<ChannelConnectionOperatorReadModel, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const connectionId = command.connectionId.trim();
      if (tenantId.length === 0) {
        return Result.fail(new ValidationError("tenantId is required"));
      }
      if (connectionId.length === 0) {
        return Result.fail(new ValidationError("connectionId is required"));
      }
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const secret = command.secret;
      if (typeof secret !== "string" || secret.length === 0) {
        return Result.fail(new ValidationError("webhook verification secret is required"));
      }
      if (secret.length > MAX_SECRET_LENGTH) {
        return Result.fail(new ValidationError("webhook verification secret exceeds maximum length"));
      }

      const connection = await this.connectionRepository.findById(tenantId, connectionId);
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }

      const reference = await this.credentialStore.putWebhookVerification(tenantId, secret);
      connection.attachWebhookVerification(reference);
      await this.connectionRepository.saveNonSemanticChanges(connection);

      await this.auditLog.append({
        tenantId,
        actorId: audit.actorId,
        action: "channel.connection.webhook_verification_attached",
        resourceType: "ChannelConnection",
        resourceId: connection.id,
        metadata: {
          status: connection.status,
          hasWebhookVerificationRef: true,
        },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(toChannelConnectionOperatorReadModel(connection));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
