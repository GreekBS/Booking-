import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelCredentialStore } from "../ports/IChannelCredentialStore";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import { validateChannelCredentialMaterial } from "./channelCredentialMaterial";
import {
  toChannelConnectionOperatorReadModel,
  type ChannelConnectionOperatorReadModel,
} from "./ChannelConnectionOperatorReadModel";

export interface PutChannelConnectionCredentialsCommand {
  tenantId: string;
  connectionId: string;
  material: Record<string, string>;
  now?: Date;
}

/**
 * iCal statuses where a plain credential replacement would silently reuse the
 * current semantic epoch and poll cursor. These must go through
 * `RotateIcalConnectionCredentialsUseCase` (P1-S6c).
 */
const ICAL_ROTATION_ONLY_STATUSES: ReadonlySet<ChannelConnectionStatus> = new Set([
  "active",
  "paused",
]);

/**
 * Seal credential material and attach/replace the opaque reference on the connection.
 * Never logs or audits raw material.
 */
export class PutChannelConnectionCredentialsUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly credentialStore: IChannelCredentialStore,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLog: IAuditLogRepository,
  ) {}

  async execute(
    command: PutChannelConnectionCredentialsCommand,
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

      validateChannelCredentialMaterial(command.material);

      const connection = await this.connectionRepository.findById(tenantId, connectionId);
      if (!connection) {
        return Result.fail(new NotFoundError("ChannelConnection", connectionId));
      }

      // P1-S6c: replacing an iCal credential in place would keep the current
      // semantic epoch and poll cursor pointing at the previous feed identity.
      // Fail closed and force the rotation path; draft / pending_auth / error
      // attach flows stay available.
      if (
        connection.provider === "ical" &&
        ICAL_ROTATION_ONLY_STATUSES.has(connection.status)
      ) {
        return Result.fail(
          new ConflictError(
            `iCal credentials for a ${connection.status} connection must be rotated with RotateIcalConnectionCredentialsUseCase`,
            "ical_rotation_required",
          ),
        );
      }

      const reference = await this.credentialStore.putCredential(tenantId, command.material);
      const priorStatus = connection.status;
      const rotated = priorStatus !== "draft" && priorStatus !== "error";

      if (rotated) {
        connection.replaceCredentialReference(reference);
        await this.connectionRepository.saveNonSemanticChanges(connection);
      } else {
        connection.attachCredentials(reference);
        await this.connectionRepository.persistCredentialAttachment(connection, priorStatus);
      }

      await this.auditLog.append({
        tenantId,
        actorId: audit.actorId,
        action: rotated
          ? "channel.connection.credentials_rotated"
          : "channel.connection.credentials_attached",
        resourceType: "ChannelConnection",
        resourceId: connection.id,
        metadata: {
          priorStatus,
          status: connection.status,
          hasCredentialRef: true,
        },
        ipAddress: audit.ipAddress,
      });

      return Result.ok(toChannelConnectionOperatorReadModel(connection));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
