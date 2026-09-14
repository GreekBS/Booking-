export interface AvailabilityDelta {
  tenantId: string;
  unitId: string;
  connectionId: string;
  mappingId: string;
  from: string;
  to: string;
  revision: number;
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
