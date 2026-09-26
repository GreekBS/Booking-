/**
 * Deterministic Guest contact normalization (CRM-1).
 * False duplicates preferred over false merges — never invent identity.
 */

const PLACEHOLDER_EMAIL_SUFFIXES = ["@invalid.talos.local"] as const;

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!trimmed.includes("@")) return null;
  if (PLACEHOLDER_EMAIL_SUFFIXES.some((s) => trimmed.endsWith(s))) {
    return null;
  }
  // Reject obvious synthetic stubs used in tests/channels
  if (trimmed.startsWith("noreply+") && trimmed.includes("@invalid.")) {
    return null;
  }
  return trimmed;
}

/**
 * Conservative phone normalization.
 * Preserves digits (and leading + when present). Does not invent country codes.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Cap absurd lengths
  if (digits.length > 15) return null;
  return hasPlus ? `+${digits}` : digits;
}

export function normalizeCountry(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const c = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  return c;
}

export function normalizePreferredLanguage(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.length > 16) return null;
  return v;
}

/** Lowercased trimmed display name for comparison only. */
export function normalizeDisplayNameForCompare(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Tokenize a display name into significant tokens (≥2 chars).
 */
export function nameTokens(raw: string): string[] {
  return normalizeDisplayNameForCompare(raw)
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Compatible names: empty either side, exact equal, or shared token.
 * Incompatible: both non-empty, no shared token → treat as different humans.
 */
export function namesAreCompatible(a: string, b: string): boolean {
  const na = normalizeDisplayNameForCompare(a);
  const nb = normalizeDisplayNameForCompare(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(nameTokens(a));
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.length === 0) return true;
  return tb.some((t) => ta.has(t));
}

export function isUsableEmailNormalized(emailNormalized: string | null): boolean {
  return emailNormalized != null && emailNormalized.length > 0;
}

export function isUsablePhoneNormalized(phoneNormalized: string | null): boolean {
  return phoneNormalized != null && phoneNormalized.length > 0;
}
