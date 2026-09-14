/**
 * Provider-neutral `reservation.unknown` taxonomy (CM-4b S1).
 *
 * Evidence metadata only — does not enable Booking create/modify/cancel.
 * iCal-specific classification behavior belongs in later slices (S8+).
 *
 * Reason-code / versioning policy:
 * - Core reason codes use stable snake_case.
 * - Provider-specific qualifiers belong in `providerDetail`, not new domain categories.
 * - Adding a reason code within an existing category is additive (no version bump).
 * - Category rename/removal/split or semantic change requires a new taxonomyVersion.
 * - `providerDetail` and `notes` are non-secret fields (never credentials, URLs with tokens, headers, or signing secrets).
 */

/** Initial supported taxonomy version. */
export const UNKNOWN_TAXONOMY_VERSION_1 = 1 as const;

/** Taxonomy versions accepted by S1 construction / v1 validation. */
export const SUPPORTED_UNKNOWN_TAXONOMY_VERSIONS = [UNKNOWN_TAXONOMY_VERSION_1] as const;

export type SupportedUnknownTaxonomyVersion = (typeof SUPPORTED_UNKNOWN_TAXONOMY_VERSIONS)[number];

/** Closed taxonomy v1 categories (provider-neutral). */
export const UNKNOWN_CATEGORIES_V1 = [
  "ambiguous_reservation",
  "inventory_block",
  "owner_block",
  "maintenance_block",
  "recurring_master",
  "recurrence_instance_unsupported",
  "stay_changed_unhandled",
  "malformed_identity",
  "malformed_time",
  "unsupported_vevent_feature",
  "duplicate_uid",
  "cancellation_unproven",
  "provider_limitation",
  "parser_limitation",
  "future_unsupported",
  "other_unclassified",
] as const;

export type UnknownCategoryV1 = (typeof UNKNOWN_CATEGORIES_V1)[number];

/** Alias for the current closed category set (v1). */
export type UnknownCategory = UnknownCategoryV1;

/**
 * Representative provider-neutral reason codes.
 * Not an exhaustive allow-list — adapters may use additional snake_case codes.
 */
export const UNKNOWN_REASON_CODES = {
  LEGACY_MISSING_TAXONOMY: "legacy_missing_taxonomy",
} as const;

export type KnownUnknownReasonCode =
  (typeof UNKNOWN_REASON_CODES)[keyof typeof UNKNOWN_REASON_CODES];

/**
 * Mandatory classification envelope on `reservation.unknown` payload.
 *
 * `taxonomyVersion` and `category` are the primary switch keys for readers.
 * Future versions may introduce categories outside {@link UnknownCategoryV1};
 * construction in S1 requires taxonomy v1 only.
 */
export interface UnknownClassification {
  taxonomyVersion: number;
  category: string;
  reasonCode: string;
  providerDetail?: string;
  reclassifiable: boolean;
  notes?: string;
}

/** Taxonomy v1 envelope produced by the shared factory. */
export interface UnknownClassificationV1 extends UnknownClassification {
  taxonomyVersion: typeof UNKNOWN_TAXONOMY_VERSION_1;
  category: UnknownCategoryV1;
}

/** Payload key for the taxonomy envelope (single source of truth). */
export const UNKNOWN_CLASSIFICATION_PAYLOAD_KEY = "unknownClassification" as const;

/**
 * Optional author compatibility alias — always derived from `reasonCode`.
 * Not independently writable; never a second classification source of truth.
 */
export const CLASSIFICATION_REASON_ALIAS_KEY = "classificationReason" as const;

export const LEGACY_MISSING_TAXONOMY_CLASSIFICATION: UnknownClassificationV1 = {
  taxonomyVersion: UNKNOWN_TAXONOMY_VERSION_1,
  category: "other_unclassified",
  reasonCode: UNKNOWN_REASON_CODES.LEGACY_MISSING_TAXONOMY,
  reclassifiable: false,
};

export function isUnknownCategoryV1(value: unknown): value is UnknownCategoryV1 {
  return (
    typeof value === "string" &&
    (UNKNOWN_CATEGORIES_V1 as readonly string[]).includes(value)
  );
}

export function isSupportedUnknownTaxonomyVersion(
  value: unknown,
): value is SupportedUnknownTaxonomyVersion {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (SUPPORTED_UNKNOWN_TAXONOMY_VERSIONS as readonly number[]).includes(value)
  );
}
