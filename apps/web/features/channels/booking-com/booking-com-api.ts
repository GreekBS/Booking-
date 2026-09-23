import { AdminApiError, adminFetch } from "@/lib/admin/api";
import type { OperatorChannelConnection } from "../types";
import type {
  BookingComCapabilities,
  BookingComOperatorView,
  BookingComDiscoveryResult,
  BookingComValidationResult,
  BookingComInitialSyncPreviewResult,
  BookingComConfirmResult,
  BookingComReconcileResult,
  BookingComProductMappingKind,
} from "./types";

export async function fetchBookingComCapabilities(
  tenantId: string,
): Promise<BookingComCapabilities> {
  return adminFetch<BookingComCapabilities>("/channels/booking-com/capabilities", {
    tenantId,
  });
}

export async function beginBookingComSetup(
  tenantId: string,
  body?: { displayName?: string; resumeConnectionId?: string },
): Promise<{
  connection: OperatorChannelConnection;
  partnerAccess: BookingComCapabilities;
  resumed: boolean;
}> {
  return adminFetch("/channels/booking-com/begin-setup", {
    method: "POST",
    tenantId,
    body: JSON.stringify(body ?? {}),
  });
}

export async function fetchBookingComOperatorView(
  tenantId: string,
  connectionId: string,
): Promise<BookingComOperatorView> {
  return adminFetch<BookingComOperatorView>(
    `/channel-connections/${connectionId}/booking-com`,
    { tenantId },
  );
}

export async function upsertBookingComProductMapping(
  tenantId: string,
  connectionId: string,
  body: {
    mappingId?: string;
    kind: BookingComProductMappingKind;
    propertyId?: string | null;
    unitId?: string | null;
    ratePlanId?: string | null;
    externalHotelId?: string | null;
    externalRoomTypeId?: string | null;
    externalRatePlanId?: string | null;
    externalRoomRateKey?: string | null;
  },
): Promise<{ mappingId: string; mappingVersion: number; mappingConfigGeneration: number }> {
  return adminFetch(`/channel-connections/${connectionId}/booking-com/product-mappings`, {
    method: "PUT",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function discoverBookingComRemote(
  tenantId: string,
  connectionId: string,
  hotelId?: string,
): Promise<BookingComDiscoveryResult> {
  return adminFetch(`/channel-connections/${connectionId}/booking-com/discover`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(hotelId ? { hotelId } : {}),
  });
}

export async function validateBookingComMappingsApi(
  tenantId: string,
  connectionId: string,
  body: {
    expectedPropertyId?: string | null;
    includeDiscovery?: boolean;
    activeUnitIds: string[];
    activeRatePlanIds: string[];
    unitPropertyIds?: Record<string, string>;
  },
): Promise<BookingComValidationResult> {
  return adminFetch(`/channel-connections/${connectionId}/booking-com/validate`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function previewBookingComInitialSync(
  tenantId: string,
  connectionId: string,
  body: {
    from: string;
    to: string;
    expectedPropertyId?: string | null;
    activeUnitIds: string[];
    activeRatePlanIds: string[];
    unitPropertyIds?: Record<string, string>;
  },
): Promise<BookingComInitialSyncPreviewResult> {
  return adminFetch(`/channel-connections/${connectionId}/booking-com/initial-sync`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function confirmBookingComInitialSync(
  tenantId: string,
  connectionId: string,
  body: {
    confirmationToken: string;
    mappingConfigGeneration: number;
    talosStateFingerprint: string;
    remoteSnapshotFingerprint: string;
    from: string;
    to: string;
  },
): Promise<BookingComConfirmResult> {
  return adminFetch(`/channel-connections/${connectionId}/booking-com/initial-sync`, {
    method: "PUT",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function reconcileBookingComConnection(
  tenantId: string,
  connectionId: string,
  body: {
    from: string;
    to: string;
    activeUnitIds: string[];
    activeRatePlanIds: string[];
    unitPropertyIds?: Record<string, string>;
    runReservationRecovery?: boolean;
  },
): Promise<BookingComReconcileResult> {
  return adminFetch(`/channel-connections/${connectionId}/booking-com/reconcile`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export function formatBookingComApiError(err: unknown): string {
  if (err instanceof AdminApiError) {
    if (err.message.toLowerCase().includes("stale preview")) {
      return "Your Talos or mapping configuration changed. Please review a new synchronization preview.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Request failed";
}
