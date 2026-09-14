import { ValidationError } from "../../shared/errors/DomainError";
import {
  isFeedSemanticMode,
  parseSemanticConfigVersion,
  type FeedSemanticMode,
} from "../types/FeedSemanticMode";
import { sha256HexUtf8, utf8ByteLength } from "../utils/sha256Hex";

/**
 * Durable operation identity for semantic-mode transitions (CM-4b S3d).
 * Command receipt primary key is (tenantId, operation, commandId).
 */
export const CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION =
  "channel.connection.set_semantic_mode" as const;

export type ChannelSemanticModeTransitionOperation =
  typeof CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION;

/**
 * Serialization format identity for fingerprint material (not the durable operation).
 * Changing this value intentionally invalidates prior fingerprints.
 */
export const SEMANTIC_MODE_TRANSITION_FINGERPRINT_FORMAT_VERSION =
  "cm4b-s3d-fingerprint-v1" as const;

/**
 * Inputs that participate in the canonical request fingerprint.
 * Timestamps, committed results, secrets, and payloads are excluded.
 */
export interface SemanticModeTransitionFingerprintInput {
  tenantId: string;
  operation: ChannelSemanticModeTransitionOperation;
  commandId: string;
  connectionId: string;
  actorId: string;
  expectedFromMode: FeedSemanticMode;
  expectedSemanticConfigVersion: number;
  targetSemanticMode: FeedSemanticMode;
  /** Optional non-secret operator reason; fingerprint uses a stable digest. */
  reason?: string | null;
}

/**
 * Canonical fingerprint field order (length-prefixed UTF-8 envelope, then SHA-256 hex):
 * 1. formatVersion
 * 2. tenantId
 * 3. operation
 * 4. commandId
 * 5. connectionId
 * 6. actorId
 * 7. expectedFromMode
 * 8. expectedSemanticConfigVersion (decimal integer string)
 * 9. targetSemanticMode
 * 10. reasonDigest (SHA-256 hex of trimmed reason, or empty string when absent/blank)
 *
 * Each field is encoded as: `<nameUtf8ByteLen>:<name><valueUtf8ByteLen>:<value>`
 * Lengths are UTF-8 byte counts, so embedded newlines, colons, and digits cannot
 * shift field boundaries.
 */
export function normalizeSemanticTransitionReasonDigest(
  reason: string | null | undefined,
): string {
  // Domain contract: null/undefined and whitespace-only reasons are equivalent.
  if (reason == null) {
    return "";
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return sha256HexUtf8(trimmed);
}

/**
 * Encodes one name/value pair with UTF-8 byte-length prefixes.
 * Exported for unit tests that assert envelope structure.
 */
export function encodeLengthPrefixedFingerprintField(
  name: string,
  value: string,
): string {
  return `${utf8ByteLength(name)}:${name}${utf8ByteLength(value)}:${value}`;
}

export function buildCanonicalSemanticModeTransitionFingerprintMaterial(
  input: SemanticModeTransitionFingerprintInput,
): string {
  assertFingerprintInput(input);
  const reasonDigest = normalizeSemanticTransitionReasonDigest(input.reason);
  const fields: ReadonlyArray<readonly [string, string]> = [
    ["formatVersion", SEMANTIC_MODE_TRANSITION_FINGERPRINT_FORMAT_VERSION],
    ["tenantId", input.tenantId],
    ["operation", input.operation],
    ["commandId", input.commandId],
    ["connectionId", input.connectionId],
    ["actorId", input.actorId],
    ["expectedFromMode", input.expectedFromMode],
    ["expectedSemanticConfigVersion", String(input.expectedSemanticConfigVersion)],
    ["targetSemanticMode", input.targetSemanticMode],
    ["reasonDigest", reasonDigest],
  ];
  return fields.map(([name, value]) => encodeLengthPrefixedFingerprintField(name, value)).join("");
}

/**
 * Returns a lowercase 64-character SHA-256 hex digest compatible with
 * channel_semantic_transition_commands.request_fingerprint.
 */
export function fingerprintSemanticModeTransitionCommand(
  input: SemanticModeTransitionFingerprintInput,
): string {
  const material = buildCanonicalSemanticModeTransitionFingerprintMaterial(input);
  return sha256HexUtf8(material);
}

function assertFingerprintInput(input: SemanticModeTransitionFingerprintInput): void {
  assertNonEmpty(input.tenantId, "tenantId");
  if (input.operation !== CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION) {
    throw new ValidationError(
      `Unsupported semantic transition operation: ${String(input.operation)}`,
    );
  }
  assertNonEmpty(input.commandId, "commandId");
  assertNonEmpty(input.connectionId, "connectionId");
  assertNonEmpty(input.actorId, "actorId");
  if (!isFeedSemanticMode(input.expectedFromMode)) {
    throw new ValidationError(
      `Invalid expectedFromMode: ${String(input.expectedFromMode)}`,
    );
  }
  if (!isFeedSemanticMode(input.targetSemanticMode)) {
    throw new ValidationError(
      `Invalid targetSemanticMode: ${String(input.targetSemanticMode)}`,
    );
  }
  parseSemanticConfigVersion(input.expectedSemanticConfigVersion);
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} is required`);
  }
}
