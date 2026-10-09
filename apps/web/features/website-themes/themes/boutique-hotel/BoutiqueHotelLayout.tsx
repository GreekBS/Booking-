"use client";

import { useId, useState } from "react";
import { DM_Sans, Libre_Baskerville } from "next/font/google";
import type { ThemeLayoutProps } from "../../contracts";
import { deriveHeroLocationLabel } from "../luxury-villa/derive-location-label";
import { renderBoutiqueHotelSection } from "./BoutiqueHotelSections";
import styles from "./boutique-hotel.module.css";

const display = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-bh-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500"],
  variable: "--font-bh-body",
  display: "swap",
});

const NAV = [
  { href: "#story", label: "House" },
  { href: "#rooms", label: "Rooms" },
  { href: "#gallery", label: "Gallery" },
  { href: "#location", label: "Location" },
  { href: "#faq", label: "FAQ" },
] as const;

/**
 * Boutique Hotel theme root — architectural editorial chrome.
 * Structurally independent from Luxury Villa layout.
 */
export function BoutiqueHotelLayout({
  content,
  sections,
  context,
}: ThemeLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const propertyName =
    context.propertyDisplayName?.trim() ||
    content.seo.metaTitle?.split("·")[0]?.trim() ||
    "Boutique hotel";
  const locationLabel = deriveHeroLocationLabel(content);

  return (
    <div
      className={`${styles.root} ${display.variable} ${body.variable}`}
      data-testid="bh-theme-root"
      data-theme-id="boutique_hotel"
      data-viewport={context.viewport ?? "desktop"}
      style={{ fontFamily: `var(--font-bh-body), "Segoe UI", sans-serif` }}
    >
      <a className={styles.skip} href="#story">
        Skip to content
      </a>

      <header className={styles.masthead}>
        <div className={styles.brandBlock}>
          <a className={styles.brand} href="#top">
            {propertyName}
          </a>
          <p className={styles.brandTag}>Boutique hotel</p>
        </div>
        <nav className={styles.navRow} aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <a href="#reserve">Reserve</a>
        </nav>
        <button
          type="button"
          className={styles.menuBtn}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
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
      </header>

      <main>
        {sections.length === 0 ? (
          <p className={styles.section} data-testid="bh-empty-sections">
            No visible sections to preview.
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.id}>
              {renderBoutiqueHotelSection(section, { locationLabel })}
            </div>
          ))
        )}
      </main>

      <footer className={styles.footer} data-testid="bh-footer">
        <div className={styles.footerInner}>
          <div>
            <p className={styles.footerBrand}>{propertyName}</p>
            <p className={styles.footerMeta}>
              Fictional boutique hotel preview for Talos Website Builder. Demo
              imagery marked DEMO — not a published website.
            </p>
          </div>
          <nav className={styles.footerNav} aria-label="Footer">
            <a href="#story">House</a>
            <a href="#rooms">Rooms</a>
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
