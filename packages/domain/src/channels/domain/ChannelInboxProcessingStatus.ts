export type ChannelInboxProcessingStatus =
  | "received"
  | "processing"
  | "completed"
  | "duplicate"
  | "skipped"
  | "failed"
  | "dead_letter";

export const TERMINAL_INBOX_STATUSES: ReadonlySet<ChannelInboxProcessingStatus> = new Set([
  "completed",
  "duplicate",
  "skipped",
  "dead_letter",
]);

export const REPLAYABLE_INBOX_STATUSES: ReadonlySet<ChannelInboxProcessingStatus> = new Set([
  "failed",
  "dead_letter",
  "skipped",
]);
