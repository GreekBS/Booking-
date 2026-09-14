import { ValidationError } from "../../shared/errors/DomainError";
import { Result } from "../../shared/kernel/Result";
import {
  isSupportedUnknownTaxonomyVersion,
  isUnknownCategoryV1,
  UNKNOWN_TAXONOMY_VERSION_1,
  type UnknownClassification,
  type UnknownClassificationV1,
} from "./UnknownTaxonomy";

/**
 * Stable snake_case machine-readable reason codes:
 * starts with a letter, then lowercase alphanumerics / underscores.
 */
const REASON_CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const MAX_REASON_CODE_LENGTH = 128;
const MAX_OPTIONAL_TEXT_LENGTH = 512;

export type UnknownClassificationInput = {
  taxonomyVersion: number;
  category: string;
  reasonCode: string;
  reclassifiable: boolean;
  providerDetail?: string;
  notes?: string;
};

/**
 * Strict validation for constructing taxonomy v1 envelopes.
 * Fail-closed: no silent coercion.
 */
export function validateUnknownClassificationV1(
  input: unknown,
): Result<UnknownClassificationV1, ValidationError> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return Result.fail(new ValidationError("unknownClassification must be an object"));
  }

  const record = input as Record<string, unknown>;

  if (!("reclassifiable" in record)) {
    return Result.fail(new ValidationError("unknownClassification.reclassifiable is required"));
  }
  if (typeof record.reclassifiable !== "boolean") {
    return Result.fail(
      new ValidationError("unknownClassification.reclassifiable must be a boolean"),
    );
  }

  const versionResult = validateTaxonomyVersionForConstruction(record.taxonomyVersion);
  if (versionResult.isFailure) {
    return Result.fail(versionResult.getError());
  }

  if (!isUnknownCategoryV1(record.category)) {
    return Result.fail(
      new ValidationError(
        `unknownClassification.category must be a taxonomy v1 category; received: ${String(record.category)}`,
      ),
    );
  }

  const reasonResult = validateReasonCode(record.reasonCode);
  if (reasonResult.isFailure) {
    return Result.fail(reasonResult.getError());
  }

  const providerDetailError = validateOptionalText(record.providerDetail, "providerDetail");
  if (providerDetailError) {
    return Result.fail(providerDetailError);
  }

  const notesError = validateOptionalText(record.notes, "notes");
  if (notesError) {
    return Result.fail(notesError);
  }

  const envelope: UnknownClassificationV1 = {
    taxonomyVersion: UNKNOWN_TAXONOMY_VERSION_1,
    category: record.category,
    reasonCode: reasonResult.getValue(),
    reclassifiable: record.reclassifiable,
  };

  if (typeof record.providerDetail === "string") {
    envelope.providerDetail = record.providerDetail;
  }
  if (typeof record.notes === "string") {
    envelope.notes = record.notes;
  }

  return Result.ok(envelope);
}

/**
 * Structural parse for readers. Supports switch-on-version:
 * - taxonomy v1 → category must be in the closed v1 set
 * - other positive integer versions → category is a non-empty string (future-tolerant)
 *
 * Construction must use {@link validateUnknownClassificationV1} (fail-closed on unsupported versions).
 */
export function parseUnknownClassification(
  input: unknown,
): Result<UnknownClassification, ValidationError> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return Result.fail(new ValidationError("unknownClassification must be an object"));
  }

  const record = input as Record<string, unknown>;

  if (!("reclassifiable" in record)) {
    return Result.fail(new ValidationError("unknownClassification.reclassifiable is required"));
  }
  if (typeof record.reclassifiable !== "boolean") {
    return Result.fail(
      new ValidationError("unknownClassification.reclassifiable must be a boolean"),
    );
  }

  const version = record.taxonomyVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return Result.fail(
      new ValidationError(
        "unknownClassification.taxonomyVersion must be a positive integer",
      ),
    );
  }

  const reasonResult = validateReasonCode(record.reasonCode);
  if (reasonResult.isFailure) {
    return Result.fail(reasonResult.getError());
  }

  const providerDetailError = validateOptionalText(record.providerDetail, "providerDetail");
  if (providerDetailError) {
    return Result.fail(providerDetailError);
  }

  const notesError = validateOptionalText(record.notes, "notes");
  if (notesError) {
    return Result.fail(notesError);
  }

  if (isSupportedUnknownTaxonomyVersion(version)) {
    if (!isUnknownCategoryV1(record.category)) {
      return Result.fail(
        new ValidationError(
          `unknownClassification.category must be a taxonomy v1 category; received: ${String(record.category)}`,
        ),
      );
    }
  } else if (typeof record.category !== "string" || record.category.trim().length === 0) {
    return Result.fail(
      new ValidationError("unknownClassification.category must be a non-empty string"),
    );
  }

  const envelope: UnknownClassification = {
    taxonomyVersion: version,
    category: String(record.category).trim(),
    reasonCode: reasonResult.getValue(),
    reclassifiable: record.reclassifiable,
  };

  if (typeof record.providerDetail === "string") {
    envelope.providerDetail = record.providerDetail;
  }
  if (typeof record.notes === "string") {
    envelope.notes = record.notes;
  }

  return Result.ok(envelope);
}

function validateTaxonomyVersionForConstruction(
  value: unknown,
): Result<typeof UNKNOWN_TAXONOMY_VERSION_1, ValidationError> {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return Result.fail(
      new ValidationError(
        "unknownClassification.taxonomyVersion must be a positive integer",
      ),
    );
  }
  if (value < 1) {
    return Result.fail(
      new ValidationError(
        "unknownClassification.taxonomyVersion must be a positive integer",
      ),
    );
  }
  if (!isSupportedUnknownTaxonomyVersion(value)) {
    return Result.fail(
      new ValidationError(
        `unknownClassification.taxonomyVersion ${value} is not supported for construction (supported: ${UNKNOWN_TAXONOMY_VERSION_1})`,
      ),
    );
  }
  return Result.ok(UNKNOWN_TAXONOMY_VERSION_1);
}

function validateReasonCode(value: unknown): Result<string, ValidationError> {
  if (typeof value !== "string") {
    return Result.fail(
      new ValidationError("unknownClassification.reasonCode must be a non-empty string"),
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return Result.fail(
      new ValidationError("unknownClassification.reasonCode must be a non-empty string"),
    );
  }
  if (trimmed.length > MAX_REASON_CODE_LENGTH) {
    return Result.fail(
      new ValidationError(
        `unknownClassification.reasonCode exceeds maximum length of ${MAX_REASON_CODE_LENGTH}`,
      ),
    );
  }
  if (!REASON_CODE_PATTERN.test(trimmed)) {
    return Result.fail(
      new ValidationError(
        "unknownClassification.reasonCode must be machine-readable snake_case (e.g. legacy_missing_taxonomy)",
      ),
    );
  }
  return Result.ok(trimmed);
}

/** Returns a ValidationError when invalid; otherwise undefined (field absent or valid string). */
function validateOptionalText(
  value: unknown,
  field: "providerDetail" | "notes",
): ValidationError | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return new ValidationError(`unknownClassification.${field} must be a string when present`);
  }
  if (value.length > MAX_OPTIONAL_TEXT_LENGTH) {
    return new ValidationError(
      `unknownClassification.${field} exceeds maximum length of ${MAX_OPTIONAL_TEXT_LENGTH}`,
    );
  }
  return undefined;
}
