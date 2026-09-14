/**
 * CM-4b S4a-1 environment gate for admin operator connection API.
 * Enabled only when CHANNELS_OPERATOR_API_ENABLED === "true".
 * Default: disabled.
 */
export function isChannelOperatorApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CHANNELS_OPERATOR_API_ENABLED === "true";
}
