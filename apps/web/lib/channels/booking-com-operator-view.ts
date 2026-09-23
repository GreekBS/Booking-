import type {
  ChannelProductMapping,
  ChannelConnectionProviderSetupRecord,
  ChannelReconciliationRunRecord,
  BookingComConnectionSetup,
} from "@hcp/domain";
import { parseBookingComConnectionSetup } from "@hcp/domain";

export type BookingComOperatorSetupPhase =
  | "not_connected"
  | "setup_required"
  | "awaiting_access"
  | "mapping_required"
  | "ready_for_sync_preview"
  | "ready_to_activate"
  | "connected"
  | "paused"
  | "degraded"
  | "disconnected";

export function deriveBookingComOperatorPhase(input: {
  connectionStatus: string;
  setup: BookingComConnectionSetup | null;
  activeRoomMappings: number;
  activeRateMappings: number;
  activeRoomRateMappings: number;
  hasPropertyMapping: boolean;
  needsAttention?: boolean;
  liveConnectivityAvailable: boolean;
}): BookingComOperatorSetupPhase {
  if (input.connectionStatus === "disconnected") return "disconnected";
  if (input.connectionStatus === "paused") return "paused";
  if (input.connectionStatus === "active") {
    return input.needsAttention ? "degraded" : "connected";
  }
  if (!input.liveConnectivityAvailable && !input.setup?.hotelId) {
    return "awaiting_access";
  }
  if (!input.setup || !input.hasPropertyMapping) return "setup_required";
  if (
    input.activeRoomMappings === 0 ||
    input.activeRateMappings === 0 ||
    input.activeRoomRateMappings === 0
  ) {
    return "mapping_required";
  }
  if (!input.setup.mappingReady || input.setup.setupProgress === "sync_preview") {
    if (input.setup.initialSyncReady) return "ready_to_activate";
    return "ready_for_sync_preview";
  }
  if (input.setup.initialSyncReady && input.setup.setupProgress === "ready_to_activate") {
    return "ready_to_activate";
  }
  return "setup_required";
}

export function serializeProductMapping(m: ChannelProductMapping): Record<string, unknown> {
  return {
    mappingId: m.id,
    connectionId: m.connectionId,
    provider: m.provider,
    kind: m.kind,
    propertyId: m.propertyId,
    unitId: m.unitId,
    ratePlanId: m.ratePlanId,
    externalHotelId: m.externalHotelId,
    externalRoomTypeId: m.externalRoomTypeId,
    externalRatePlanId: m.externalRatePlanId,
    externalRoomRateKey: m.externalRoomRateKey,
    status: m.status,
    mappingVersion: m.mappingVersion,
    mappingConfigGeneration: m.mappingConfigGeneration,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function serializeSetupRecord(
  record: ChannelConnectionProviderSetupRecord | null,
): Record<string, unknown> | null {
  if (!record) return null;
  const setup = parseBookingComConnectionSetup(record.setup);
  return {
    provider: record.provider,
    mappingConfigGeneration: record.mappingConfigGeneration,
    updatedAt: record.updatedAt.toISOString(),
    hotelId: setup.hotelId,
    pricingModel: setup.pricingModel,
    setupProgress: setup.setupProgress,
    mappingReady: setup.mappingReady,
    initialSyncReady: setup.initialSyncReady,
    approvedConnectionTypes: setup.approvedConnectionTypes,
  };
}

export function serializeReconciliationRun(
  run: ChannelReconciliationRunRecord,
): Record<string, unknown> {
  return {
    id: run.id,
    scope: run.scope,
    outcome: run.outcome,
    mappingConfigGeneration: run.mappingConfigGeneration,
    autoHealEnqueued: run.autoHealEnqueued,
    details: run.details,
    completedAt: run.completedAt.toISOString(),
  };
}

export const BOOKING_COM_OPERATOR_PHASE_LABELS: Record<
  BookingComOperatorSetupPhase,
  string
> = {
  not_connected: "Not connected",
  setup_required: "Setup required",
  awaiting_access: "Awaiting access",
  mapping_required: "Mapping required",
  ready_for_sync_preview: "Ready for sync preview",
  ready_to_activate: "Ready to activate",
  connected: "Connected",
  paused: "Paused",
  degraded: "Needs attention",
  disconnected: "Disconnected",
};
