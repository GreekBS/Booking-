import type { ChannelPollExecutionContext } from "../../../types/ChannelTransportExecutionContext";
import type { IChannelPollingProvider } from "../../../ports/providers/IChannelPollingProvider";
import type {
  IcalInventoryActionableSnapshot,
  IcalInventoryActionableProjectionResult,
} from "../inventory/buildIcalInventoryActionableSnapshot";
import type { IcalInboundIngressItem } from "./buildIcalInboundIngressItems";
import type { IcalMapIssueCode } from "../map/icalMapIssueCodes";

export interface IcalPollTrustedIngressResult {
  readonly items: readonly IcalInboundIngressItem[];
  readonly nextCursor: string;
  readonly mapIssueCodes: readonly IcalMapIssueCode[];
  readonly evidenceRecordCount: number;
  /** P1-S6a FULL DATE actionable projection; null when capacity/projection failed. */
  readonly inventoryActionableSnapshot: IcalInventoryActionableSnapshot | null;
  readonly inventoryProjectionFailureCode: Extract<
    IcalInventoryActionableProjectionResult,
    { ok: false }
  >["code"] | null;
}

/** iCal-only trusted poll contract — explicit dedup keys never come from message payload. */
export interface IIcalTrustedIngressPollingProvider extends IChannelPollingProvider {
  pollTrustedIngress(
    connectionId: string,
    cursor: string | null,
    context: ChannelPollExecutionContext,
  ): Promise<IcalPollTrustedIngressResult>;
}

export function isIcalTrustedIngressPollingProvider(
  provider: IChannelPollingProvider,
): provider is IIcalTrustedIngressPollingProvider {
  return (
    typeof (provider as IIcalTrustedIngressPollingProvider).pollTrustedIngress === "function"
  );
}
