import { LEAD_SOURCES, type LeadSource } from "@hcp/domain";

const ALLOWED = new Set<string>(LEAD_SOURCES);

/**
 * Accept only allowlisted Lead sources from the URL.
 * Unknown / arbitrary values fall back to `other`.
 * Accepts snake_case or SCREAMING_SNAKE for convenience.
 */
export function parseLeadSourceParam(
  raw: string | string[] | null | undefined,
): LeadSource {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return "other";

  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (ALLOWED.has(normalized)) {
    return normalized as LeadSource;
  }
  return "other";
}

export function parseOptionalUtm(
  raw: string | string[] | null | undefined,
  max = 200,
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}
