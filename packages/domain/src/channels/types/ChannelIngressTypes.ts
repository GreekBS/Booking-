export interface ChannelIngressMessageResult {
  messageId: string;
  success: boolean;
  inboxItemId?: string;
  deduplicated?: boolean;
  errorMessage?: string;
}

export interface ChannelIngressBatchResult {
  /** True only when every intended message was durably accepted by ReceiveChannelEventUseCase. */
  ackAllowed: boolean;
  results: ChannelIngressMessageResult[];
}
