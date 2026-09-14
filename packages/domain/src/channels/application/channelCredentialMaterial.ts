import { ValidationError } from "../../shared/errors/DomainError";

export const MAX_CHANNEL_CREDENTIAL_MATERIAL_KEYS = 32;
export const MAX_CHANNEL_CREDENTIAL_MATERIAL_VALUE_LENGTH = 4096;

/**
 * Shape validation for opaque credential material.
 * Never logs, audits, or echoes values — only key-shape violations are reported.
 */
export function validateChannelCredentialMaterial(
  material: Record<string, string>,
): void {
  if (material == null || typeof material !== "object") {
    throw new ValidationError("credential material is required");
  }
  const entries = Object.entries(material);
  if (entries.length === 0) {
    throw new ValidationError("credential material must not be empty");
  }
  if (entries.length > MAX_CHANNEL_CREDENTIAL_MATERIAL_KEYS) {
    throw new ValidationError(
      `credential material may have at most ${MAX_CHANNEL_CREDENTIAL_MATERIAL_KEYS} keys`,
    );
  }
  for (const [key, value] of entries) {
    if (key.trim().length === 0) {
      throw new ValidationError("credential material keys must be non-empty");
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new ValidationError("credential material values must be non-empty strings");
    }
    if (value.length > MAX_CHANNEL_CREDENTIAL_MATERIAL_VALUE_LENGTH) {
      throw new ValidationError("credential material value exceeds maximum length");
    }
  }
}

/**
 * iCal credential material must carry the feed URL under `feedUrl`.
 * The value itself is a secret (it can embed a token) and must never leave the
 * vault boundary — only its presence is validated here.
 */
export function assertIcalCredentialMaterialShape(
  material: Record<string, string>,
): void {
  validateChannelCredentialMaterial(material);
  const feedUrl = material.feedUrl;
  if (typeof feedUrl !== "string" || feedUrl.trim().length === 0) {
    throw new ValidationError("iCal credential material must include a non-empty feedUrl");
  }
}
