import {
  ChannelProviderRegistry,
  ValidationError,
  createIcalProviderRegistration,
  type ChannelProviderRegistration,
} from "@hcp/domain";
import { domainIcalFeedFetcher } from "./ical/domainIcalFeedFetcher";

/**
 * Production provider factory catalog (constructors only).
 * Presence of a factory does **not** register the provider.
 * Activation remains CHANNELS_ENABLED_PROVIDERS → bootstrap → register.
 * Simulation / test-only providers must never be registered here.
 */
export const PRODUCTION_CHANNEL_PROVIDER_FACTORIES: Readonly<
  Record<string, () => ChannelProviderRegistration>
> = Object.freeze({
  ical: () => createIcalProviderRegistration({ feedFetcher: domainIcalFeedFetcher }),
});

/**
 * Parse CHANNELS_ENABLED_PROVIDERS.
 * Comma-separated, trim, drop empties, case-sensitive, reject duplicates.
 * Missing / empty / whitespace-only → [].
 */
export function parseChannelsEnabledProviders(
  raw: string | undefined | null,
): string[] {
  if (raw == null || raw.trim() === "") {
    return [];
  }

  const parts = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const seen = new Set<string>();
  for (const id of parts) {
    if (seen.has(id)) {
      throw new ValidationError(
        `Duplicate CHANNELS_ENABLED_PROVIDERS entry: ${id}`,
      );
    }
    seen.add(id);
  }
  return parts;
}

/**
 * Register allow-listed providers into the production registry.
 * Unknown IDs fail closed (ValidationError). Empty list → empty registry (healthy).
 */
export function bootstrapChannelProviderRegistry(
  registry: ChannelProviderRegistry,
  enabledProviderIds: readonly string[],
  factories: Readonly<
    Record<string, () => ChannelProviderRegistration>
  > = PRODUCTION_CHANNEL_PROVIDER_FACTORIES,
): void {
  for (const providerId of enabledProviderIds) {
    const factory = factories[providerId];
    if (!factory) {
      throw new ValidationError(
        `Unknown CHANNELS_ENABLED_PROVIDERS entry: ${providerId}`,
      );
    }
    registry.register(factory());
  }
}

/**
 * Create and bootstrap the production ChannelProviderRegistry singleton.
 * Safe when CHANNELS_ENABLED_PROVIDERS is absent (empty registry).
 */
export function createProductionChannelProviderRegistry(
  env: NodeJS.ProcessEnv = process.env,
  factories: Readonly<
    Record<string, () => ChannelProviderRegistration>
  > = PRODUCTION_CHANNEL_PROVIDER_FACTORIES,
): ChannelProviderRegistry {
  const registry = new ChannelProviderRegistry();
  const enabled = parseChannelsEnabledProviders(env.CHANNELS_ENABLED_PROVIDERS);
  bootstrapChannelProviderRegistry(registry, enabled, factories);
  return registry;
}
