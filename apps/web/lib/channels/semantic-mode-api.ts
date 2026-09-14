/**
 * CM-4b S3f environment gate for admin semantic-mode API.
 * Enabled only when CHANNELS_SEMANTIC_MODE_API_ENABLED === "true".
 * Default: disabled.
 */
export function isChannelSemanticModeApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CHANNELS_SEMANTIC_MODE_API_ENABLED === "true";
}
