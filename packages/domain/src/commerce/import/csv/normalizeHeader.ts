/**
 * Deterministic CSV header normalization for alias matching.
 * - trim
 * - Unicode NFD + strip combining marks (Latin/Greek diacritics)
 * - lowercase
 * - spaces / underscores / hyphens → single underscore
 */
export function normalizeCsvHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
