import { Result } from "../../shared/kernel/Result";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionLifecycleUnitOfWork } from "../ports/IChannelConnectionLifecycleUnitOfWork";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelConnectionPropertyRelevanceReader } from "../ports/IChannelConnectionPropertyRelevanceReader";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import {
  buildLifecycleAuditMetadata,
  prepareLifecycleActivation,
  type ChannelConnectionLifecycleCommandBase,
  type ChannelConnectionRotationGate,
} from "./ChannelConnectionLifecycleActivationSupport";
import type { ChannelConnectionLifecycleActivationResult } from "./ActivateChannelConnectionUseCase";

export type ResumeChannelConnectionCommand = ChannelConnectionLifecycleCommandBase;

const RESUME_SOURCE_STATUSES = new Set<ChannelConnectionStatus>(["paused"]);

/**
 * Resume a paused ChannelConnection under mandatory semantic policy and epoch CAS (CM-4b S3e).
 *
 * Source status: paused → active.
 * error → active is activate, not resume.
 */
export class ResumeChannelConnectionUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly providerRegistry: IChannelProviderRegistry,
    private readonly permissionChecker: PermissionChecker,
    private readonly unitOfWork: IChannelConnectionLifecycleUnitOfWork,
    /** P1-S6c: refuses resume while a credential rotation is in flight. */
    private readonly rotationGate: ChannelConnectionRotationGate | null = null,
    private readonly relevanceReader: IChannelConnectionPropertyRelevanceReader | null = null,
  ) {}

  async execute(
    command: ResumeChannelConnectionCommand,
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ): Promise<Result<ChannelConnectionLifecycleActivationResult, Error>> {
    try {
      const prepared = await prepareLifecycleActivation({
        command,
        actor,
        connectionRepository: this.connectionRepository,
        providerRegistry: this.providerRegistry,
        permissionChecker: this.permissionChecker,
        relevanceReader: this.relevanceReader,
        allowedPriorStatuses: RESUME_SOURCE_STATUSES,
        invalidStatusMessage: (status) =>
          `Cannot resume connection in status: ${status}`,
        mutate: (connection, now) => connection.resume(now),
        rotationGate: this.rotationGate,
      });

      await this.unitOfWork.runInTransaction(prepared.connection.tenantId, async (ports) => {
        await ports.connections.resumeWithExpectedSemanticVersion(
          prepared.connection,
          prepared.expectedSemanticConfigVersion,
          prepared.priorStatus,
        );
        await ports.audit.append({
          tenantId: prepared.connection.tenantId,
          actorId: audit.actorId,
          action: "channel.connection.resumed",
          resourceType: "ChannelConnection",
          resourceId: prepared.connection.id,
          metadata: buildLifecycleAuditMetadata(prepared),
          ipAddress: audit.ipAddress,
        });
      });

      return Result.ok({
        connectionId: prepared.connection.id,
        status: "active",
        semanticMode: prepared.semanticMode,
        semanticConfigVersion: prepared.semanticConfigVersion,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
