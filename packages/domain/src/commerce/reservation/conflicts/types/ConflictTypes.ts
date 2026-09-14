import type { ChannelSource } from "../../../../channels/types/ChannelTypes";
import type { AvailabilityReason } from "../../../shared/types/CommerceTypes";

export type ConflictKind =
  | "overlap"
  | "duplicate_import"
  | "concurrent_modification"
  | "mapping_ambiguity";

export interface ConflictStayContext {
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export interface ConflictContext {
  kind: ConflictKind;
  proposed: ConflictStayContext;
  bookingId?: string;
  source?: ChannelSource;
  externalId?: string;
  availabilityReasons?: AvailabilityReason[];
}

export type ConflictResolutionStrategy = "reject" | "queue_for_review" | "accept_with_override";

export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  message: string;
}
