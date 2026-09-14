import { ValidationError } from "../../shared/errors/DomainError";

/**
 * Provider-neutral feed semantic modes (CM-4b S2).
 *
 * Declares operator trust about feed meaning. Does NOT authorize Booking creation,
 * inventory writes, or Inbox bypass. Base CM-4b remains evidence-first.
 */

export const FEED_SEMANTIC_MODES = [
  "mixed_or_unknown_feed",
  "availability_block_feed",
  "reservation_feed",
] as const;

export type FeedSemanticMode = (typeof FEED_SEMANTIC_MODES)[number];

/** Fail-closed default for new connections and undeclared provider allow-lists. */
export const DEFAULT_FEED_SEMANTIC_MODE: FeedSemanticMode = "mixed_or_unknown_feed";

export const INITIAL_SEMANTIC_CONFIG_VERSION = 1 as const;

export function isFeedSemanticMode(value: unknown): value is FeedSemanticMode {
  return typeof value === "string" && (FEED_SEMANTIC_MODES as readonly string[]).includes(value);
}

/**
 * Parses a runtime mode value. Fail-closed: no silent coercion.
 */
export function parseFeedSemanticMode(value: unknown): FeedSemanticMode {
  if (!isFeedSemanticMode(value)) {
    throw new ValidationError(
      `Invalid feed semantic mode: ${String(value)}. Expected one of: ${FEED_SEMANTIC_MODES.join(", ")}`,
    );
  }
  return value;
}

export function parseSemanticConfigVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ValidationError(
      `Invalid semanticConfigVersion: ${String(value)}. Expected a positive integer.`,
    );
  }
  return value;
}
