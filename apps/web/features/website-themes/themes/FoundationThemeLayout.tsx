import type { ThemeLayoutProps } from "../contracts";

/**
 * Neutral structural chrome for B1 theme stubs.
 * Not a product visual theme — B2+ replace per-theme Layout implementations.
 */
export function FoundationThemeLayout({
  themeId,
  content,
  sections,
  skippedSectionTypes,
  context,
  renderSection,
}: ThemeLayoutProps) {
  const title =
    context.propertyDisplayName?.trim() ||
    content.seo.metaTitle ||
    "Accommodation preview";

  return (
    <div
      className="wb-theme-foundation min-h-full bg-[#f7f5f2] text-neutral-900"
      data-testid="wb-theme-foundation"
      data-theme-id={themeId}
      data-viewport={context.viewport ?? "desktop"}
    >
      <header className="border-b border-neutral-200/80 bg-[#f7f5f2]/90 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="truncate text-sm font-semibold tracking-wide">
            {title}
          </p>
          <nav
            className="hidden gap-4 text-xs uppercase tracking-[0.14em] text-neutral-500 sm:flex"
            aria-label="Preview navigation"
          >
            <span>Stay</span>
            <span>Gallery</span>
            <span>Location</span>
            <span>Book</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl bg-white shadow-sm">
        {sections.length === 0 ? (
          <p
            className="px-4 py-12 text-center text-sm text-neutral-500"
            data-testid="wb-empty-sections"
          >
            No visible sections to preview.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.id}>{renderSection(section)}</div>
          ))
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-neutral-500 sm:px-6">
        <p>Preview only · not a published website</p>
        {skippedSectionTypes.length > 0 ? (
          <p className="mt-2" data-testid="wb-skipped-sections">
            Skipped unsupported sections: {skippedSectionTypes.join(", ")}
          </p>
        ) : null}
      </footer>
    </div>
  );
}
