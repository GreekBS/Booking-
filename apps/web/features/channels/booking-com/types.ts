import type { OperatorChannelConnection } from "../types";

export type BookingComProductMappingKind =
  | "property_hotel"
  | "unit_room"
  | "rate_plan"
  | "room_rate";

export type BookingComOperatorPhase =
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

export interface BookingComCapabilities {
  provider?: string;
  liveConnectivityAvailable: boolean;
  fixtureTransportEnabled: boolean;
  operatorMessage: string;
}

export interface BookingComProductMapping {
  mappingId: string;
  connectionId: string;
  provider: string;
  kind: BookingComProductMappingKind;
  propertyId: string | null;
  unitId: string | null;
  ratePlanId: string | null;
  externalHotelId: string | null;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
  externalRoomRateKey: string | null;
  status: string;
  mappingVersion: number;
  mappingConfigGeneration: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookingComSetupView {
  provider: string;
  mappingConfigGeneration: number;
  updatedAt: string;
  hotelId: string | null;
  pricingModel: string;
  setupProgress: string;
  mappingReady: boolean;
  initialSyncReady: boolean;
  approvedConnectionTypes: string[];
}

export interface BookingComOperatorView {
  connection: OperatorChannelConnection;
  partnerAccess: BookingComCapabilities;
  phase: BookingComOperatorPhase;
  phaseLabel: string;
  setup: BookingComSetupView | null;
  mappingConfigGeneration: number;
  mappings: BookingComProductMapping[];
  counts: {
    roomsMapped: number;
    ratesMapped: number;
    roomratesMapped: number;
    propertyMapped: boolean;
  };
  reconciliation: Array<{
    id: string;
    scope: string;
    outcome: string;
    mappingConfigGeneration: number;
    autoHealEnqueued: boolean;
    details: Record<string, unknown>;
    completedAt: string;
  }>;
}

export interface BookingComDiscoveryResult {
  available: boolean;
  partnerAccess: BookingComCapabilities;
  message?: string;
  discovery: {
    hotel: { hotelId: string; name: string | null } | null;
    rooms: Array<{ hotelId: string; roomTypeId: string; name: string | null }>;
    ratePlans: Array<{ hotelId: string; ratePlanId: string; name: string | null }>;
    roomRates: Array<{
      hotelId: string;
      roomTypeId: string;
      ratePlanId: string;
      active: boolean;
    }>;
  } | null;
}

export interface BookingComValidationResult {
  ok: boolean;
  blocking: Array<{ code: string; severity: string; message: string; mappingId?: string }>;
  warnings: Array<{ code: string; severity: string; message: string; mappingId?: string }>;
}

export interface BookingComInitialSyncPreviewResult {
  available: boolean;
  partnerAccess?: BookingComCapabilities;
  message?: string;
  previewId?: string;
  confirmationToken?: string;
  mappingConfigGeneration?: number;
  talosStateFingerprint?: string;
  remoteSnapshotFingerprint?: string;
  diff?: {
    dateHorizonFrom: string;
    dateHorizonTo: string;
    roomsAffected: number;
    roomratesAffected: number;
    availabilityChanges: number;
    opens: number;
    closes: number;
    priceChanges: number;
    minStayChanges: number;
    maxStayChanges: number;
    ctaChanges: number;
    ctdChanges: number;
    samples: Array<Record<string, unknown>>;
    fingerprint: string;
  };
  blockingIssueCount?: number;
  warningIssueCount?: number;
}

export interface BookingComConfirmResult {
  available: boolean;
  partnerAccess?: BookingComCapabilities;
  message?: string;
  previewId?: string;
  enqueued?: number;
  suppressed?: number;
  rejected?: number;
}

export interface BookingComReconcileResult {
  available: boolean;
  partnerAccess?: BookingComCapabilities;
  message?: string;
  outcomes?: Array<{
    scope: string;
    outcome: string;
    autoHealEnqueued: boolean;
  }>;
}

export const BOOKING_COM_WIZARD_STEPS = [
  { id: "before", title: "Before you start", helpAnchor: "before-you-start" },
  { id: "connect", title: "Connect in Booking.com", helpAnchor: "connect-in-booking" },
  { id: "property", title: "Match property", helpAnchor: "match-property" },
  { id: "rooms", title: "Map rooms", helpAnchor: "map-rooms" },
  { id: "rates", title: "Map rates", helpAnchor: "map-rates" },
  { id: "validate", title: "Validate", helpAnchor: "review-sync" },
  { id: "sync", title: "Synchronization", helpAnchor: "review-sync" },
  { id: "preview", title: "Initial sync preview", helpAnchor: "review-sync" },
  { id: "confirm", title: "Confirm", helpAnchor: "activate" },
  { id: "activate", title: "Activate", helpAnchor: "activate" },
] as const;

export type BookingComWizardStepId = (typeof BOOKING_COM_WIZARD_STEPS)[number]["id"];
