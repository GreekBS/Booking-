export interface AvailabilityDelta {
  tenantId: string;
  unitId: string;
  connectionId: string;
  mappingId: string;
  from: string;
  to: string;
  revision: number;
  /** Optional resolved rooms-to-sell for outbound ARI (CM-4c-3). */
  roomsToSell?: number | null;
  /** Optional open/close flag for outbound ARI (1=closed, 0=open). */
  closed?: 0 | 1 | null;
}

export interface RateDelta {
  tenantId: string;
  unitId: string;
  connectionId: string;
  mappingId: string;
  from: string;
  to: string;
  currency: string;
  nightlyRates: { date: string; amount: string }[];
}

export interface RestrictionDelta {
  tenantId: string;
  unitId: string;
  connectionId: string;
  mappingId: string;
  from: string;
  to: string;
  minStay?: number;
  maxStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

export interface ExportResult {
  success: boolean;
  externalAckId?: string;
  errorCode?: string;
}
