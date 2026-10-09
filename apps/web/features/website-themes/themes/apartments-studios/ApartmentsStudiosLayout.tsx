"use client";

import { useId, useState } from "react";
import { Karla, Source_Serif_4 } from "next/font/google";
import type { ThemeLayoutProps } from "../../contracts";
import { deriveHeroLocationLabel } from "../luxury-villa/derive-location-label";
import { renderApartmentsStudiosSection } from "./ApartmentsStudiosSections";
import styles from "./apartments-studios.module.css";

const display = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-as-display",
  display: "swap",
});

const body = Karla({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-as-body",
  display: "swap",
});

const NAV = [
  { href: "#about", label: "About" },
  { href: "#units", label: "Units" },
  { href: "#gallery", label: "Gallery" },
  { href: "#location", label: "Location" },
  { href: "#faq", label: "FAQ" },
] as const;

/**
 * Apartments & Studios theme — bright, unit-first hospitality layout.
 */
export function ApartmentsStudiosLayout({
  content,
  sections,
  context,
}: ThemeLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const propertyName =
    context.propertyDisplayName?.trim() ||
    content.seo.metaTitle?.split("·")[0]?.trim() ||
    "Apartments";
  const locationLabel = deriveHeroLocationLabel(content);

  return (
    <div
      className={`${styles.root} ${display.variable} ${body.variable}`}
      data-testid="as-theme-root"
      data-theme-id="apartments_studios"
      data-viewport={context.viewport ?? "desktop"}
      style={{ fontFamily: `var(--font-as-body), "Segoe UI", sans-serif` }}
    >
      <a className={styles.skip} href="#about">
        Skip to content
      </a>

      <header className={styles.topbar}>
        <a className={styles.brand} href="#top">
          {propertyName}
        </a>
        <nav className={styles.pillNav} aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className={styles.topCta} href="#reserve">
          Book
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
            Book
          </a>
        </div>
      ) : null}

      <main>
        {sections.length === 0 ? (
          <p className={styles.section} data-testid="as-empty-sections">
            No visible sections to preview.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.id}>
              {renderApartmentsStudiosSection(section, { locationLabel })}
            </div>
          ))
        )}
      </main>

      <footer className={styles.footer} data-testid="as-footer">
        <div className={styles.footerInner}>
          <div>
            <p className={styles.footerBrand}>{propertyName}</p>
            <p className={styles.footerMeta}>
              Fictional apartments & studios preview for Talos Website Builder.
              Demo imagery marked DEMO — not a published website.
            </p>
          </div>
          <nav className={styles.footerNav} aria-label="Footer">
            <a href="#about">About</a>
            <a href="#units">Units</a>
            <a href="#gallery">Gallery</a>
            <a href="#amenities">Amenities</a>
            <a href="#location">Location</a>
            <a href="#reserve">Book</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
