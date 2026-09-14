export interface ChannelWebhookRequestMeta {
  headers: Record<string, string>;
  /** UTF-8 view of rawBodyBytes for parse; must not be reserialized before verification. */
  rawBody: string;
  /** Immutable received bytes used for signature verification. */
  rawBodyBytes: Uint8Array;
}

export interface ChannelWebhookAckDisposition {
  ackAllowed: boolean;
  httpStatus: 200 | 400 | 401 | 403 | 500 | 503;
}
