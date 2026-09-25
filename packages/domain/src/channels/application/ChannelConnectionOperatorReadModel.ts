import type { ChannelConnection } from "../domain/ChannelConnection";
import type { ChannelConnectionStatus } from "../domain/ChannelConnectionStatus";
import type { ChannelSource } from "../types/ChannelSource";
import type { FeedSemanticMode } from "../types/FeedSemanticMode";

/**
 * Operator-safe connection read model (CM-4b S4a-1).
 * Never includes credential material or opaque secret ciphertext.
 */
export interface ChannelConnectionOperatorReadModel {
  connectionId: string;
  tenantId: string;
  provider: ChannelSource;
  displayName: string;
  status: ChannelConnectionStatus;
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  inventoryApplyEnabled: boolean;
  /** Operator workspace affinity; null when unset (legacy / unassigned). */
  workspacePropertyId: string | null;
  hasCredentialRef: boolean;
  hasWebhookVerificationRef: boolean;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toChannelConnectionOperatorReadModel(
  connection: ChannelConnection,
): ChannelConnectionOperatorReadModel {
  return {
    connectionId: connection.id,
    tenantId: connection.tenantId,
    provider: connection.provider,
    displayName: connection.displayName,
    status: connection.status,
    semanticMode: connection.semanticMode,
    semanticConfigVersion: connection.semanticConfigVersion,
    inventoryApplyEnabled: connection.inventoryApplyEnabled === true,
    workspacePropertyId: connection.workspacePropertyId,
    hasCredentialRef: connection.credentialRef != null,
    hasWebhookVerificationRef: connection.webhookVerificationRef != null,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}
