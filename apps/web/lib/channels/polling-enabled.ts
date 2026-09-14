/**
 * CM-4b S4a-2a — gate for poll job execution.
 * Enabled only when CHANNELS_POLLING_ENABLED === "true".
 * Default: disabled.
 *
 * When disabled, queued poll_channel_connection jobs complete as a safe no-op
 * (no provider, credentials, cursor, or inbox mutation).
 */
export function isChannelsPollingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CHANNELS_POLLING_ENABLED === "true";
}
