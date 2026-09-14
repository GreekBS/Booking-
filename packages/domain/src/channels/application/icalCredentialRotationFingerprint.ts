import { ValidationError } from "../../shared/errors/DomainError";
import { sha256HexUtf8, utf8ByteLength } from "../utils/sha256Hex";

/**
 * Durable operation identity for iCal credential rotation (P1-S6c).
 * Command receipt primary key is (tenantId, operation, commandId).
 */
export const CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION =
  "channel.connection.rotate_ical_credentials" as const;

export type ChannelIcalCredentialRotationOperation =
  typeof CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION;

/**
 * Serialization format identity for fingerprint material (not the durable operation).
 * Changing this value intentionally invalidates prior fingerprints.
 */
export const ICAL_CREDENTIAL_ROTATION_FINGERPRINT_FORMAT_VERSION =
  "p1-s6c-rotation-fingerprint-v1" as const;

export interface IcalCredentialRotationFingerprintInput {
  tenantId: string;
  operation: ChannelIcalCredentialRotationOperation;
  commandId: string;
  connectionId: string;
  actorId: string;
  /** Optional epoch CAS declared by the operator. */
  expectedSemanticConfigVersion?: number | null;
  /** Rotation credential material. Only its digest participates in the fingerprint. */
  material: Record<string, string>;
  /** Optional non-secret operator reason; fingerprint uses a stable digest. */
  reason?: string | null;
}

/**
 * SHA-256 over canonical sorted `key=value` pairs of the credential material.
 *
 * The digest is the ONLY representation of credential material that may leave
 * this module: raw `feedUrl`, tokens, and secrets must never be persisted,
 * logged, audited, or placed on a rotation receipt.
 *
 * Pairs are length-prefixed (UTF-8 byte counts) so `=`, newlines, and digits
 * inside keys or values cannot shift field boundaries.
 */
export function buildIcalCredentialRotationMaterialDigest(
  material: Record<string, string>,
): string {
  if (material == null || typeof material !== "object") {
    throw new ValidationError("credential material is required");
  }
  const entries = Object.entries(material);
  if (entries.length === 0) {
    throw new ValidationError("credential material must not be empty");
  }
  for (const [key, value] of entries) {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new ValidationError("credential material keys must be non-empty");
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new ValidationError("credential material values must be non-empty strings");
    }
  }
  const canonical = entries
    .slice()
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => encodeLengthPrefixedRotationField(key, value))
    .join("");
  return sha256HexUtf8(canonical);
}

export function normalizeIcalRotationReasonDigest(
  reason: string | null | undefined,
): string {
  if (reason == null) {
    return "";
  }
  const trimmed = reason.trim();
  return trimmed.length === 0 ? "" : sha256HexUtf8(trimmed);
}

/**
 * Encodes one name/value pair with UTF-8 byte-length prefixes.
 * Exported for unit tests that assert envelope structure.
 */
export function encodeLengthPrefixedRotationField(name: string, value: string): string {
  return `${utf8ByteLength(name)}:${name}${utf8ByteLength(value)}:${value}`;
}

/**
 * Canonical fingerprint field order:
 * 1. formatVersion
 * 2. tenantId
 * 3. operation
 * 4. commandId
 * 5. connectionId
 * 6. actorId
 * 7. expectedSemanticConfigVersion (decimal integer string, or empty when absent)
 * 8. materialDigest
 * 9. reasonDigest
 */
export function buildCanonicalIcalCredentialRotationFingerprintMaterial(
  input: IcalCredentialRotationFingerprintInput,
): string {
  assertFingerprintInput(input);
  const fields: ReadonlyArray<readonly [string, string]> = [
    ["formatVersion", ICAL_CREDENTIAL_ROTATION_FINGERPRINT_FORMAT_VERSION],
    ["tenantId", input.tenantId],
    ["operation", input.operation],
    ["commandId", input.commandId],
    ["connectionId", input.connectionId],
    ["actorId", input.actorId],
    [
      "expectedSemanticConfigVersion",
      input.expectedSemanticConfigVersion == null
        ? ""
        : String(input.expectedSemanticConfigVersion),
    ],
    ["materialDigest", buildIcalCredentialRotationMaterialDigest(input.material)],
    ["reasonDigest", normalizeIcalRotationReasonDigest(input.reason)],
  ];
  return fields
    .map(([name, value]) => encodeLengthPrefixedRotationField(name, value))
    .join("");
}

/**
 * Returns a lowercase 64-character SHA-256 hex digest compatible with
 * channel_ical_credential_rotation_commands.request_fingerprint.
 */
export function fingerprintIcalCredentialRotationCommand(
  input: IcalCredentialRotationFingerprintInput,
): string {
  return sha256HexUtf8(
    buildCanonicalIcalCredentialRotationFingerprintMaterial(input),
  );
}

function assertFingerprintInput(input: IcalCredentialRotationFingerprintInput): void {
  assertNonEmpty(input.tenantId, "tenantId");
  if (input.operation !== CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION) {
    throw new ValidationError(
      `Unsupported credential rotation operation: ${String(input.operation)}`,
    );
  }
  assertNonEmpty(input.commandId, "commandId");
  assertNonEmpty(input.connectionId, "connectionId");
  assertNonEmpty(input.actorId, "actorId");
  if (input.expectedSemanticConfigVersion != null) {
    if (
      !Number.isInteger(input.expectedSemanticConfigVersion) ||
      input.expectedSemanticConfigVersion < 1
    ) {
      throw new ValidationError(
        "expectedSemanticConfigVersion must be a positive integer when provided",
      );
    }
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} is required`);
  }
}
