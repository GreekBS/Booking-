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
import { ChannelProviderRegistrationError } from "../errors/ChannelProviderRegistrationError";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelConnectionPropertyRelevanceReader } from "../ports/IChannelConnectionPropertyRelevanceReader";
import type { IIcalCredentialRotationStore } from "../ports/IIcalCredentialRotationStore";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { FeedSemanticMode } from "../types/FeedSemanticMode";
import { parseSemanticConfigVersion } from "../types/FeedSemanticMode";
import { resolveAllowedFeedSemanticModes } from "../types/FeedSemanticModePolicy";
import { assertActorCanOperateChannelConnection } from "./ChannelConnectionPropertyAuthorization";

export interface ChannelConnectionLifecycleCommandBase {
  tenantId: string;
  connectionId: string;
  expectedSemanticConfigVersion: number;
  correlationId?: string | null;
  now?: Date;
}

export interface PreparedLifecycleActivation {
  connection: ChannelConnection;
  priorStatus: ChannelConnectionStatus;
  expectedSemanticConfigVersion: number;
  correlationId: string | null | undefined;
  now: Date;
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
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
 * Read-only gate used to refuse activation/resume while a credential rotation is
 * still in flight for the connection (P1-S6c).
 */
export type ChannelConnectionRotationGate = Pick<
  IIcalCredentialRotationStore,
  "findInProgressForConnection"
>;

/**
 * Shared S3e pre-TX authorization, policy, and domain mutation for activate/resume.
 *
 * P1-S6c adds a rotation gate: a connection with an `in_progress` iCal credential
 * rotation must not return to `active` until that rotation commits or fails.
 */
export async function prepareLifecycleActivation(input: {
  command: ChannelConnectionLifecycleCommandBase;
  actor: ActorContext;
  connectionRepository: IChannelConnectionRepository;
  providerRegistry: IChannelProviderRegistry;
  permissionChecker: PermissionChecker;
  relevanceReader?: IChannelConnectionPropertyRelevanceReader | null;
  allowedPriorStatuses: ReadonlySet<ChannelConnectionStatus>;
  invalidStatusMessage: (status: ChannelConnectionStatus) => string;
  mutate: (connection: ChannelConnection, now: Date) => void;
  rotationGate?: ChannelConnectionRotationGate | null;
}): Promise<PreparedLifecycleActivation> {
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

  if (input.rotationGate) {
    const inFlightRotation = await input.rotationGate.findInProgressForConnection(
      tenantId,
      connectionId,
    );
    if (inFlightRotation) {
      throw new ConflictError(
        "A credential rotation is in progress for this connection; complete or abandon it before returning to active",
        "rotation_in_progress",
      );
    }
  }

  const actorMayDeclareReservationFeed = input.permissionChecker.hasPermission(
    input.actor,
    PERMISSIONS.CHANNELS_CONNECTION_DECLARE_RESERVATION_FEED,
    tenantId,
  );

  if (connection.semanticMode === "reservation_feed" && !actorMayDeclareReservationFeed) {
    throw new ForbiddenError();
  }

  const registration = input.providerRegistry.get(connection.provider);
  if (!registration) {
    throw new ChannelProviderRegistrationError(
      `Provider registration not found: ${connection.provider}`,
    );
  }

  const allowedFeedSemanticModes = resolveAllowedFeedSemanticModes(
    registration.allowedFeedSemanticModes,
  );

  connection.assertSemanticActivationAllowed({
    allowedFeedSemanticModes,
    actorMayDeclareReservationFeed,
  });

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
  };
}

export function buildLifecycleAuditMetadata(prepared: PreparedLifecycleActivation): {
  previousStatus: ChannelConnectionStatus;
  newStatus: "active";
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  correlationId?: string | null;
} {
  return {
    previousStatus: prepared.priorStatus,
    newStatus: "active",
    semanticMode: prepared.semanticMode,
    semanticConfigVersion: prepared.semanticConfigVersion,
    ...(prepared.correlationId !== undefined
      ? { correlationId: prepared.correlationId }
      : {}),
  };
}
