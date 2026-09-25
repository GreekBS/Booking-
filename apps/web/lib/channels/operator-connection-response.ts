import type { ChannelConnectionOperatorReadModel } from "@hcp/domain";

/** Serialize operator read model for HTTP (ISO dates; no secret material). */
export function serializeOperatorConnection(
  value: ChannelConnectionOperatorReadModel,
): Record<string, unknown> {
  return {
    connectionId: value.connectionId,
    tenantId: value.tenantId,
    provider: value.provider,
    displayName: value.displayName,
    status: value.status,
    semanticMode: value.semanticMode,
    semanticConfigVersion: value.semanticConfigVersion,
    inventoryApplyEnabled: value.inventoryApplyEnabled,
    workspacePropertyId: value.workspacePropertyId,
    hasCredentialRef: value.hasCredentialRef,
    hasWebhookVerificationRef: value.hasWebhookVerificationRef,
    lastError: value.lastError,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
