import { ValidationError } from "../../shared/errors/DomainError";
import {
  isFeedSemanticMode,
  parseSemanticConfigVersion,
  type FeedSemanticMode,
} from "./FeedSemanticMode";

/**
 * Stable, provider-neutral classification-time semantic stamp for future evidence payloads.
 * Explicit fields — must not overload taxonomy notes/providerDetail.
 * Non-secret; never credentials or feed URLs.
 */
export interface SemanticEvidenceStamp {
  mode: FeedSemanticMode;
  configVersion: number;
}

export const SEMANTIC_EVIDENCE_CONTEXT_PAYLOAD_KEY = "semanticContext" as const;

export function createSemanticEvidenceStamp(input: {
  mode: FeedSemanticMode;
  configVersion: number;
}): SemanticEvidenceStamp {
  if (!isFeedSemanticMode(input.mode)) {
    throw new ValidationError(`Invalid semantic evidence stamp mode: ${String(input.mode)}`);
  }
  const configVersion = parseSemanticConfigVersion(input.configVersion);
  return {
    mode: input.mode,
    configVersion,
  };
}

export function parseSemanticEvidenceStamp(value: unknown): SemanticEvidenceStamp {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("semanticContext must be an object");
  }
  const record = value as Record<string, unknown>;
  if (!isFeedSemanticMode(record.mode)) {
    throw new ValidationError(`Invalid semanticContext.mode: ${String(record.mode)}`);
  }
  return {
    mode: record.mode,
    configVersion: parseSemanticConfigVersion(record.configVersion),
  };
}
