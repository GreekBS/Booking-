import type { ChannelSource } from "../types/ChannelSource";
import type { ChannelIngressOrchestrationResult } from "../types/ChannelIngressOrchestrationTypes";
import type { ChannelIngressFailurePhase } from "../types/ChannelIngressOrchestrationTypes";

export function buildIngressFailureResult(
  failurePhase: ChannelIngressFailurePhase,
  errorMessage?: string,
): ChannelIngressOrchestrationResult {
  return {
    ackAllowed: false,
    results: [],
    failurePhase,
    errorMessage,
  };
}

export interface ChannelIngressOrchestrationCommandBase {
  tenantId: string;
  connectionId: string;
  provider: ChannelSource;
}
