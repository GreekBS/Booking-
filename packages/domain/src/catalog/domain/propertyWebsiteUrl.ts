import { ValidationError } from "../../shared/errors/DomainError";

const MAX_WEBSITE_URL_LENGTH = 2048;

/**
 * Normalize and validate a property website URL for storage and redirect.
 * Allows only http/https. Rejects credentials, javascript/data/file, and malformed input.
 * Returns null when clearing the field.
 */
export function normalizePropertyWebsiteUrl(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_WEBSITE_URL_LENGTH) {
    throw new ValidationError("Website URL is too long");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError("Invalid website URL");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new ValidationError("Website URL must use http or https");
  }

  if (parsed.username || parsed.password) {
    throw new ValidationError("Website URL must not include credentials");
  }

  if (!parsed.hostname || parsed.hostname.includes(" ")) {
    throw new ValidationError("Invalid website URL host");
  }

  // Rebuild without hash fragments that could confuse operators; keep path/query.
  parsed.hash = "";
  return parsed.toString();
}

/** Re-validate a stored URL immediately before redirect (defense in depth). */
export function assertSafeWebsiteRedirectUrl(url: string): string {
  const normalized = normalizePropertyWebsiteUrl(url);
  if (!normalized) {
    throw new ValidationError("Website URL is not configured");
  }
  return normalized;
}
