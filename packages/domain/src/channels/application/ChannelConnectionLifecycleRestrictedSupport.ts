import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { ChannelConnection } from "../domain/ChannelConnection";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelConnectionPropertyRelevanceReader } from "../ports/IChannelConnectionPropertyRelevanceReader";
import type { FeedSemanticMode } from "../types/FeedSemanticMode";
import { parseSemanticConfigVersion } from "../types/FeedSemanticMode";
import { assertActorCanOperateChannelConnection } from "./ChannelConnectionPropertyAuthorization";

export interface ChannelConnectionLifecycleRestrictedCommand {
  tenantId: string;
  connectionId: string;
  expectedSemanticConfigVersion: number;
  correlationId?: string | null;
  now?: Date;
}

export interface PreparedLifecycleRestrictedTransition {
  connection: ChannelConnection;
  priorStatus: ChannelConnectionStatus;
  expectedSemanticConfigVersion: number;
  correlationId: string | null | undefined;
  now: Date;
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  newStatus: ChannelConnectionStatus;
}

function normalizeRequiredId(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}

function normalizeOptionalCorrelationId(
  correlationId: string | null | undefined,
): string | null | undefined {
  if (correlationId === undefined || correlationId === null) {
    return correlationId;
  }
  const trimmed = correlationId.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("correlationId must be non-empty when provided");
  }
  if (trimmed.length > 255) {
    throw new ValidationError("correlationId must be at most 255 characters");
  }
  return trimmed;
}

/**
 * Pre-TX prepare for restricted lifecycle transitions (pause / disconnect).
 * Does not call the S3d store, provider allow-list, or semantic activation gates.
 */
export async function prepareLifecycleRestrictedTransition(input: {
  command: ChannelConnectionLifecycleRestrictedCommand;
  actor: ActorContext;
  connectionRepository: IChannelConnectionRepository;
  permissionChecker: PermissionChecker;
  relevanceReader?: IChannelConnectionPropertyRelevanceReader | null;
  allowedPriorStatuses: ReadonlySet<ChannelConnectionStatus>;
  invalidStatusMessage: (status: ChannelConnectionStatus) => string;
  mutate: (connection: ChannelConnection, now: Date) => void;
}): Promise<PreparedLifecycleRestrictedTransition> {
  const tenantId = normalizeRequiredId(input.command.tenantId, "tenantId");
  const connectionId = normalizeRequiredId(input.command.connectionId, "connectionId");
  const expectedSemanticConfigVersion = parseSemanticConfigVersion(
    input.command.expectedSemanticConfigVersion,
  );
  const correlationId = normalizeOptionalCorrelationId(input.command.correlationId);
  const now = input.command.now ?? new Date();

  if (
    !input.permissionChecker.hasPermission(
      input.actor,
      PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
      tenantId,
    )
  ) {
    throw new ForbiddenError();
  }

  const connection = await input.connectionRepository.findById(tenantId, connectionId);
  if (!connection) {
    throw new NotFoundError("ChannelConnection", connectionId);
  }

  if (input.relevanceReader) {
    const relevantPropertyIds = await input.relevanceReader.resolveRelevantPropertyIds(
      tenantId,
      connectionId,
    );
    assertActorCanOperateChannelConnection(
      input.permissionChecker,
      input.actor,
      tenantId,
      relevantPropertyIds,
    );
  }

  const priorStatus = connection.status;
  if (!input.allowedPriorStatuses.has(priorStatus)) {
    throw new ConflictError(
      input.invalidStatusMessage(priorStatus),
      "lifecycle_status_conflict",
    );
  }

  input.mutate(connection, now);

  return {
    connection,
    priorStatus,
    expectedSemanticConfigVersion,
    correlationId,
    now,
    semanticMode: connection.semanticMode,
    semanticConfigVersion: connection.semanticConfigVersion,
    newStatus: connection.status,
  };
}

export function buildRestrictedLifecycleAuditMetadata(
  prepared: PreparedLifecycleRestrictedTransition,
): {
  previousStatus: ChannelConnectionStatus;
  newStatus: ChannelConnectionStatus;
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  correlationId?: string | null;
} {
  return {
    previousStatus: prepared.priorStatus,
    newStatus: prepared.newStatus,
    semanticMode: prepared.semanticMode,
    semanticConfigVersion: prepared.semanticConfigVersion,
    ...(prepared.correlationId !== undefined
      ? { correlationId: prepared.correlationId }
      : {}),
  };
}
