import { ValidationError } from "../../shared/errors/DomainError";
import {
  DEFAULT_FEED_SEMANTIC_MODE,
  isFeedSemanticMode,
  type FeedSemanticMode,
} from "./FeedSemanticMode";

/**
 * Fail-closed allow-list when a provider has not declared allowedFeedSemanticModes.
 * Only mixed/unknown is permitted until the provider opts in explicitly.
 */
export const DEFAULT_ALLOWED_FEED_SEMANTIC_MODES: readonly FeedSemanticMode[] = [
  DEFAULT_FEED_SEMANTIC_MODE,
] as const;

export type FeedSemanticModeAllowList = readonly FeedSemanticMode[] | null | undefined;

/**
 * Resolves the effective allow-list for a provider registration.
 * null/undefined/empty → fail-closed default (mixed_or_unknown_feed only).
 */
export function resolveAllowedFeedSemanticModes(
  declared: FeedSemanticModeAllowList,
): readonly FeedSemanticMode[] {
  if (declared == null || declared.length === 0) {
    return DEFAULT_ALLOWED_FEED_SEMANTIC_MODES;
  }

  const unique: FeedSemanticMode[] = [];
  for (const mode of declared) {
    if (!isFeedSemanticMode(mode)) {
      throw new ValidationError(
        `Provider allowedFeedSemanticModes contains invalid mode: ${String(mode)}`,
      );
    }
    if (!unique.includes(mode)) {
      unique.push(mode);
    }
  }
  return unique;
}

export function isFeedSemanticModeAllowed(
  mode: FeedSemanticMode,
  declared: FeedSemanticModeAllowList,
): boolean {
  return resolveAllowedFeedSemanticModes(declared).includes(mode);
}

export function assertFeedSemanticModeAllowed(
  mode: FeedSemanticMode,
  declared: FeedSemanticModeAllowList,
): void {
  if (!isFeedSemanticModeAllowed(mode, declared)) {
    throw new ValidationError(
      `Feed semantic mode "${mode}" is not allowed by provider policy`,
    );
  }
}
