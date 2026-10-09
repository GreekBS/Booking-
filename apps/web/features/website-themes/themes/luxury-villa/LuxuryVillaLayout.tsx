"use client";

import { useId, useState } from "react";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import type { ThemeLayoutProps } from "../../contracts";
import { deriveHeroLocationLabel } from "./derive-location-label";
import { renderLuxuryVillaSection } from "./LuxuryVillaSections";
import styles from "./luxury-villa.module.css";

const display = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-lv-display",
  display: "swap",
});

const body = Outfit({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500"],
  variable: "--font-lv-body",
  display: "swap",
});

const NAV = [
  { href: "#story", label: "Story" },
  { href: "#stay", label: "Stay" },
  { href: "#gallery", label: "Gallery" },
  { href: "#location", label: "Location" },
  { href: "#faq", label: "FAQ" },
] as const;

/**
 * Luxury Villa theme root — owns chrome, typography and section composition.
 * Does not rely on foundation section visuals.
 */
export function LuxuryVillaLayout({
  content,
  sections,
  context,
}: ThemeLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const propertyName =
    context.propertyDisplayName?.trim() ||
    content.seo.metaTitle?.trim() ||
    "Villa preview";
  const locationLabel = deriveHeroLocationLabel(content);

  return (
    <div
      className={`${styles.root} ${display.variable} ${body.variable}`}
      data-testid="lv-theme-root"
      data-theme-id="luxury_villa"
      data-viewport={context.viewport ?? "desktop"}
      style={{ fontFamily: `var(--font-lv-body), "Segoe UI", sans-serif` }}
    >
      <a className={styles.skip} href="#story">
        Skip to content
      </a>

      <header className={styles.nav}>
        <a className={styles.brand} href="#top">
          {propertyName}
        </a>
        <nav className={styles.navLinks} aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className={styles.navCta} href="#reserve">
          Reserve
        </a>
        <button
          type="button"
          className={styles.menuBtn}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </header>

      {menuOpen ? (
        <div id={menuId} className={styles.mobilePanel}>
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a href="#reserve" onClick={() => setMenuOpen(false)}>
            Reserve
          </a>
        </div>
      ) : null}

      <main>
        {sections.length === 0 ? (
          <p className={styles.section} data-testid="lv-empty-sections">
            No visible sections to preview.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.id}>
              {renderLuxuryVillaSection(section, { locationLabel })}
            </div>
          ))
        )}
      </main>

      <footer className={styles.footer} data-testid="lv-footer">
        <div className={styles.footerInner}>
          <div>
            <p className={styles.footerBrand}>{propertyName}</p>
            <p className={styles.footerMeta}>
              Fictional Mediterranean villa preview for Talos Website Builder.
              Not a published website.
            </p>
          </div>
          <nav className={styles.footerNav} aria-label="Footer">
            <a href="#story">Story</a>
            <a href="#stay">Stay</a>
            <a href="#gallery">Gallery</a>
            <a href="#amenities">Amenities</a>
            <a href="#location">Location</a>
            <a href="#reserve">Reserve</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
