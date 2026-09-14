/**
 * CM-4b S4a-2b — public webhook API gate.
 * Enabled only when CHANNELS_WEBHOOK_API_ENABLED === "true".
 * Default: disabled.
 */
export function isChannelWebhookApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CHANNELS_WEBHOOK_API_ENABLED === "true";
}
