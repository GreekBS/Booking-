import type { ChannelSource } from "../types/ChannelSource";

/** Redacted poll diagnostics for Provider-1 iCal map issues (orchestration layer only). */
export interface IChannelPollDiagnosticsReporter {
  reportIcalMapIssues(input: {
    tenantId: string;
    connectionId: string;
    provider: ChannelSource;
    issueCodes: readonly string[];
    evidenceRecordCount: number;
  }): void;
}

export class NoOpChannelPollDiagnosticsReporter implements IChannelPollDiagnosticsReporter {
  reportIcalMapIssues(): void {
    // intentional no-op
  }
}
