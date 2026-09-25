export type ChannelLifecycleStatus =
  | "draft"
  | "pending_auth"
  | "active"
  | "paused"
  | "error"
  | "disconnected";

export type FeedSemanticMode =
  | "mixed_or_unknown_feed"
  | "availability_block_feed"
  | "reservation_feed";

/** Operator connection read model from `/channel-connections` APIs (no secrets). */
export interface OperatorChannelConnection {
  connectionId: string;
  tenantId: string;
  provider: string;
  displayName: string;
  status: ChannelLifecycleStatus;
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  inventoryApplyEnabled: boolean;
  workspacePropertyId: string | null;
  hasCredentialRef: boolean;
  hasWebhookVerificationRef: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorChannelMapping {
  mappingId: string;
  connectionId: string;
  externalListingId: string;
  externalUnitId: string | null;
  propertyId: string;
  unitId: string;
  syncDirection: string;
  status: string;
  mappingVersion: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelJobHealth {
  id: string;
  status: string;
  attemptCount: number;
  runAt: string;
  nextRetryAt: string | null;
  completedAt: string | null;
}

export interface ChannelConnectionHealth {
  connectionId: string;
  connectionStatus: string;
  provider: string;
  semanticMode: string;
  semanticConfigVersion: number;
  hasCredentialRef: boolean;
  activeMappingCount: number;
  cursorVersion: number | null;
  cursorUpdatedAt: string | null;
  inventoryApplyEnabled: boolean;
  inventoryApplyGloballyEnabled: boolean;
  inventoryApplyForConnection: boolean;
  inventoryApplyEffective: boolean;
  pilotEligible: boolean;
  pilotEligibilityReasons: string[];
  activeChannelImportCount: number;
  latestPollJob: ChannelJobHealth | null;
  latestReconcileJob: ChannelJobHealth | null;
  pendingReconciliationCount: number;
  needsAttention: boolean;
  attentionReasons: string[];
}
