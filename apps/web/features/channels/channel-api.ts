import { AdminApiError, adminFetch } from "@/lib/admin/api";
import type {
  ChannelConnectionHealth,
  OperatorChannelConnection,
  OperatorChannelMapping,
} from "./types";

function newCommandId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export { AdminApiError, newCommandId };

export async function listChannelConnections(
  tenantId: string,
  propertyId: string,
): Promise<OperatorChannelConnection[]> {
  const res = await adminFetch<{ connections: OperatorChannelConnection[] }>(
    `/channel-connections?propertyId=${encodeURIComponent(propertyId)}`,
    { tenantId },
  );
  return res.connections ?? [];
}

export async function getChannelConnection(
  tenantId: string,
  connectionId: string,
): Promise<OperatorChannelConnection> {
  return adminFetch<OperatorChannelConnection>(`/channel-connections/${connectionId}`, {
    tenantId,
  });
}

export async function createIcalConnection(
  tenantId: string,
  displayName: string,
  workspacePropertyId: string,
): Promise<OperatorChannelConnection> {
  return adminFetch<OperatorChannelConnection>("/channel-connections", {
    method: "POST",
    tenantId,
    body: JSON.stringify({
      provider: "ical",
      displayName,
      workspacePropertyId,
    }),
  });
}

/** First-time / draft|error|pending_auth credential attach. Never logs feed URL. */
export async function putIcalFeedCredentials(
  tenantId: string,
  connectionId: string,
  feedUrl: string,
): Promise<OperatorChannelConnection> {
  return adminFetch<OperatorChannelConnection>(
    `/channel-connections/${connectionId}/credentials`,
    {
      method: "PUT",
      tenantId,
      body: JSON.stringify({ material: { feedUrl } }),
    },
  );
}

/** Active/paused iCal feed rotation (pauses connection; requires resume). */
export async function rotateIcalFeedCredentials(
  tenantId: string,
  connectionId: string,
  feedUrl: string,
  expectedSemanticConfigVersion: number,
): Promise<unknown> {
  const commandId = newCommandId();
  return adminFetch(`/channel-connections/${connectionId}/credentials/rotate`, {
    method: "POST",
    tenantId,
    headers: { "Idempotency-Key": commandId },
    body: JSON.stringify({
      commandId,
      material: { feedUrl },
      expectedSemanticConfigVersion,
    }),
  });
}

export async function setAvailabilityBlockFeedMode(
  tenantId: string,
  connectionId: string,
  expectedSemanticConfigVersion: number,
  acknowledgedFromMode: string,
): Promise<{ semanticConfigVersion?: number; newMode?: string }> {
  const commandId = newCommandId();
  return adminFetch(`/channel-connections/${connectionId}/semantic-mode`, {
    method: "PUT",
    tenantId,
    headers: { "Idempotency-Key": commandId },
    body: JSON.stringify({
      targetMode: "availability_block_feed",
      expectedSemanticConfigVersion,
      commandId,
      confirmation: {
        confirmed: true,
        acknowledgedFromMode,
        acknowledgedToMode: "availability_block_feed",
      },
    }),
  });
}

export async function listChannelMappings(
  tenantId: string,
  connectionId: string,
): Promise<OperatorChannelMapping[]> {
  const res = await adminFetch<{ mappings: OperatorChannelMapping[] }>(
    `/channel-connections/${connectionId}/mappings`,
    { tenantId },
  );
  return res.mappings ?? [];
}

export async function upsertChannelMapping(
  tenantId: string,
  connectionId: string,
  body: {
    mappingId?: string;
    externalListingId: string;
    propertyId: string;
    unitId: string;
    expectedSemanticConfigVersion: number;
    syncDirection?: "inbound";
  },
): Promise<{ resultingSemanticConfigVersion?: number; requiresPollRematerialization?: boolean }> {
  return adminFetch(`/channel-connections/${connectionId}/mappings`, {
    method: "PUT",
    tenantId,
    body: JSON.stringify({
      ...body,
      syncDirection: body.syncDirection ?? "inbound",
    }),
  });
}

export async function activateChannelConnection(
  tenantId: string,
  connectionId: string,
  expectedSemanticConfigVersion: number,
): Promise<unknown> {
  return adminFetch(`/channel-connections/${connectionId}/activate`, {
    method: "POST",
    tenantId,
    body: JSON.stringify({ expectedSemanticConfigVersion }),
  });
}

export async function pauseChannelConnection(
  tenantId: string,
  connectionId: string,
  expectedSemanticConfigVersion: number,
): Promise<unknown> {
  return adminFetch(`/channel-connections/${connectionId}/pause`, {
    method: "POST",
    tenantId,
    body: JSON.stringify({ expectedSemanticConfigVersion }),
  });
}

export async function resumeChannelConnection(
  tenantId: string,
  connectionId: string,
  expectedSemanticConfigVersion: number,
): Promise<unknown> {
  return adminFetch(`/channel-connections/${connectionId}/resume`, {
    method: "POST",
    tenantId,
    body: JSON.stringify({ expectedSemanticConfigVersion }),
  });
}

export async function disconnectChannelConnection(
  tenantId: string,
  connectionId: string,
  expectedSemanticConfigVersion: number,
): Promise<unknown> {
  return adminFetch(`/channel-connections/${connectionId}/disconnect`, {
    method: "POST",
    tenantId,
    body: JSON.stringify({ expectedSemanticConfigVersion }),
  });
}

export async function enableInventoryApply(
  tenantId: string,
  connectionId: string,
  expectedSemanticConfigVersion: number,
): Promise<{ inventoryApplyEnabled: boolean; semanticConfigVersion?: number }> {
  return adminFetch(`/channel-connections/${connectionId}/inventory-apply/enable`, {
    method: "POST",
    tenantId,
    body: JSON.stringify({ expectedSemanticConfigVersion }),
  });
}

export async function disableInventoryApply(
  tenantId: string,
  connectionId: string,
  expectedSemanticConfigVersion: number,
): Promise<{ inventoryApplyEnabled: boolean; semanticConfigVersion?: number }> {
  return adminFetch(`/channel-connections/${connectionId}/inventory-apply/disable`, {
    method: "POST",
    tenantId,
    body: JSON.stringify({ expectedSemanticConfigVersion }),
  });
}

export async function deactivateConnectionInventory(
  tenantId: string,
  connectionId: string,
  expectedSemanticConfigVersion: number,
): Promise<unknown> {
  return adminFetch(`/channel-connections/${connectionId}/inventory/deactivate`, {
    method: "POST",
    tenantId,
    body: JSON.stringify({ expectedSemanticConfigVersion }),
  });
}

export async function enqueueManualPoll(
  tenantId: string,
  connectionId: string,
): Promise<{ status: string; jobId: string; jobStatus: string }> {
  return adminFetch(`/channel-connections/${connectionId}/poll`, {
    method: "POST",
    tenantId,
    body: JSON.stringify({}),
  });
}

export async function getChannelHealth(
  tenantId: string,
  connectionId: string,
): Promise<ChannelConnectionHealth> {
  return adminFetch<ChannelConnectionHealth>(
    `/channel-connections/${connectionId}/health`,
    { tenantId },
  );
}

export function formatChannelApiError(err: unknown): string {
  if (err instanceof AdminApiError) {
    if (err.status === 404 && err.message.toLowerCase().includes("disabled")) {
      return "Channel operator API is disabled for this environment (CHANNELS_OPERATOR_API_ENABLED).";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Request failed";
}
