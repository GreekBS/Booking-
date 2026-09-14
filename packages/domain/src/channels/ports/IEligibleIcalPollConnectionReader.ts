/**
 * P1-S7b — eligible iCal connections for recurring poll schedule.
 */
export interface EligibleIcalPollConnection {
  readonly tenantId: string;
  readonly connectionId: string;
}

export interface IEligibleIcalPollConnectionReader {
  listEligible(limit?: number): Promise<readonly EligibleIcalPollConnection[]>;
}
