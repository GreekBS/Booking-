import type { ChannelImportPayload } from "./ChannelTypes";
import {
  LEGACY_MISSING_TAXONOMY_CLASSIFICATION,
  UNKNOWN_CLASSIFICATION_PAYLOAD_KEY,
  type UnknownClassification,
  type UnknownClassificationV1,
} from "./UnknownTaxonomy";
import { parseUnknownClassification } from "./UnknownClassificationValidation";
import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";

/**
 * Read-only taxonomy interpretation for `reservation.unknown` payload evidence.
 *
 * Historical rows without an envelope are not rewritten. Missing envelope yields
 * the approved legacy classification (`other_unclassified` / `legacy_missing_taxonomy`).
 *
 * Does not mutate the input payload.
 */
export function readUnknownClassification(
  payload: ChannelImportPayload | Record<string, unknown>,
): Result<UnknownClassification, ValidationError> {
  const raw = payload[UNKNOWN_CLASSIFICATION_PAYLOAD_KEY];
  if (raw === undefined || raw === null) {
    return Result.ok(cloneClassification(LEGACY_MISSING_TAXONOMY_CLASSIFICATION));
  }
  return parseUnknownClassification(raw);
}

/** True when the payload lacks a taxonomy envelope (legacy / pre-S1 evidence). */
export function isLegacyMissingUnknownClassification(
  payload: ChannelImportPayload | Record<string, unknown>,
): boolean {
  const raw = payload[UNKNOWN_CLASSIFICATION_PAYLOAD_KEY];
  return raw === undefined || raw === null;
}

/**
 * Derived author alias only — mirrors `reasonCode`. Not a second source of truth.
 */
export function deriveClassificationReasonAlias(reasonCode: string): string {
  return reasonCode;
}

function cloneClassification(value: UnknownClassificationV1): UnknownClassificationV1 {
  const clone: UnknownClassificationV1 = {
    taxonomyVersion: value.taxonomyVersion,
    category: value.category,
    reasonCode: value.reasonCode,
    reclassifiable: value.reclassifiable,
  };
  if (value.providerDetail !== undefined) {
    clone.providerDetail = value.providerDetail;
  }
  if (value.notes !== undefined) {
    clone.notes = value.notes;
  }
  return clone;
}
