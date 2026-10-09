/** Operator-facing labels for code theme registry ids (A4 summary only — no previews). */
export const WEBSITE_THEME_LABELS: Record<string, string> = {
  unset: "Μη επιλεγμένο",
  luxury_villa: "Luxury villa",
  boutique_hotel: "Boutique hotel",
  apartments_studios: "Apartments & studios",
  nature_retreat: "Nature retreat",
};

export function websiteThemeLabel(themeId: string): string {
  return WEBSITE_THEME_LABELS[themeId] ?? themeId;
}

export const WEBSITE_STATUS_LABELS: Record<string, string> = {
  draft: "Πρόχειρο",
  published: "Δημοσιευμένο",
  unpublished: "Ανέκδοτο",
};

export function websiteStatusLabel(status: string): string {
  return WEBSITE_STATUS_LABELS[status] ?? status;
}
