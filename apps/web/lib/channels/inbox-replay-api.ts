/**
 * CM-4b S4a-2b — admin inbox replay API gate.
 * Enabled only when CHANNELS_INBOX_REPLAY_API_ENABLED === "true".
 * Default: disabled.
 */
export function isChannelInboxReplayApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CHANNELS_INBOX_REPLAY_API_ENABLED === "true";
}
