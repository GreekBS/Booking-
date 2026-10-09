import type { WebsiteDraftContent } from "@hcp/validators";

/**
 * Derive a short, public-safe hero location line from validated website content.
 * Prefers the location section's directionsText (website content only — never PMS).
 * Returns null when nothing suitable exists (caller omits the eyebrow).
 */
export function deriveHeroLocationLabel(
  content: WebsiteDraftContent,
): string | null {
  const location = content.sections.find(
    (s) => s.type === "location" && s.visible !== false,
  );
  if (location?.type === "location" && location.directionsText?.trim()) {
    const first = location.directionsText
      .trim()
      .split(/[.!?\n]/)[0]
      ?.trim();
    if (first && first.length >= 3) {
      return first.length > 72 ? `${first.slice(0, 69).trimEnd()}…` : first;
    }
  }

  const meta = content.seo.metaTitle?.trim();
  if (meta) {
    // Use a trailing destination fragment when authors encode "Name · Place".
    const parts = meta.split(/[·|—–-]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const place = parts[parts.length - 1]!;
      if (place.length >= 2 && place.length <= 72) return place;
    }
  }

  return null;
}
