/** Ephemeral credential material passed to providers — never persisted. */
export interface ChannelWebhookVerifyContext {
  webhookSecret?: string;
  credentialMaterial?: Record<string, string>;
}

export interface ChannelPollExecutionContext {
  credentialMaterial?: Record<string, string>;
}
