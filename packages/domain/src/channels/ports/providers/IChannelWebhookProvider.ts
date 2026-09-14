import type {
  ChannelProviderMessage,
  ChannelWebhookVerificationResult,
} from "../../types/ChannelProviderMessage";
import type { ChannelWebhookRequestMeta } from "../../types/ChannelWebhookTransportTypes";
import type { ChannelWebhookVerifyContext } from "../../types/ChannelTransportExecutionContext";

export interface IChannelWebhookProvider {
  verify(
    request: ChannelWebhookRequestMeta,
    context: ChannelWebhookVerifyContext,
  ): Promise<ChannelWebhookVerificationResult>;
  parse(payload: unknown): Promise<ChannelProviderMessage[]>;
}
