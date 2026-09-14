export interface ProcessChannelInboxJobPayload {
  inboxItemId: string;
}

export const DEFAULT_INBOX_LEASE_TTL_MS = 5 * 60 * 1000;
