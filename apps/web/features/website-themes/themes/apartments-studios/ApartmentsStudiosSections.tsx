import type { ReactNode } from "react";
import type { WebsiteSection } from "@hcp/validators";
import { APARTMENTS_STUDIOS_ASSET_IDS } from "../../sample/sample-apartments-studios";
import { sanitizeRichtextToReact } from "../../sanitize/richtext";
import { ApartmentsStudiosMedia } from "./ApartmentsStudiosMedia";
import styles from "./apartments-studios.module.css";

function isNearby(section: Extract<WebsiteSection, { type: "highlights" }>) {
  const purpose = section.settings?.purpose;
  return purpose === "nearby" || purpose === "attractions";
}

function safeHref(url?: string): string | undefined {
  if (!url) return undefined;
  const v = url.trim();
  if (!v) return undefined;
  const lower = v.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return undefined;
  }
  return v;
}

export type ApartmentsStudiosSectionOptions = {
  locationLabel?: string | null;
};

export function renderApartmentsStudiosSection(
  section: WebsiteSection,
  options: ApartmentsStudiosSectionOptions = {},
): ReactNode {
  switch (section.type) {
    case "hero":
      return (
        <section
          id="top"
          className={styles.hero}
          data-testid="as-section-hero"
          aria-label="Hero"
        >
          <div className={styles.heroMedia}>
            {section.backgroundAssetId ? (
              <ApartmentsStudiosMedia assetId={section.backgroundAssetId} />
            ) : (
              <div className={styles.mediaFallback} aria-hidden>
                Welcome
              </div>
            )}
          </div>
          <div className={styles.heroBand}>
            <div className={styles.heroInner}>
              {options.locationLabel ? (
                <p className={styles.heroKicker} data-testid="as-hero-location">
                  {options.locationLabel}
                </p>
              ) : (
                <p className={styles.heroKicker}>Apartments & studios</p>
              )}
              <h1 className={styles.heroTitle}>{section.headline}</h1>
              {section.subheadline ? (
                <p className={styles.heroLead}>{section.subheadline}</p>
              ) : null}
              <div className={styles.heroActions}>
                {section.ctaLabel ? (
                  <a
                    className={styles.btnPrimary}
                    href={safeHref(section.ctaUrl) ?? "#reserve"}
                  >
                    {section.ctaLabel}
                  </a>
                ) : null}
                <a className={styles.btnGhost} href="#units">
                  View units
                </a>
              </div>
            </div>
          </div>
        </section>
      );

    case "richtext":
      return (
        <section
          id="about"
          className={styles.section}
          data-testid="as-section-intro"
          aria-labelledby={`as-intro-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.introGrid}`}>
            <div>
              <p className={styles.sectionLabel}>About</p>
              <h2 id={`as-intro-${section.id}`} className={styles.sectionTitle}>
                A welcoming place to settle in
              </h2>
              <div className={styles.prose}>
                {sanitizeRichtextToReact(section.body)}
              </div>
            </div>
            <div className={styles.frame}>
              <ApartmentsStudiosMedia
                assetId={APARTMENTS_STUDIOS_ASSET_IDS.gallery3}
                label="Complex facade"
              />
            </div>
          </div>
        </section>
      );

    case "split":
      return (
        <section
          className={styles.section}
          data-testid="as-section-split"
          aria-labelledby={`as-split-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.introGrid}`}>
            <div
              className={styles.frame}
              style={{ order: section.imagePosition === "right" ? 2 : 0 }}
            >
              <ApartmentsStudiosMedia
                assetId={section.assetId}
                label={section.headline}
              />
            </div>
            <div>
              <p className={styles.sectionLabel}>Stay easy</p>
              <h2 id={`as-split-${section.id}`} className={styles.sectionTitle}>
                {section.headline}
              </h2>
              <div className={styles.prose}>
                {sanitizeRichtextToReact(section.body)}
              </div>
            </div>
          </div>
        </section>
      );

    case "highlights":
      if (isNearby(section)) {
        return (
          <section
            id="nearby"
            className={styles.section}
            data-testid="as-section-nearby"
            aria-labelledby={`as-nearby-${section.id}`}
          >
            <div className={styles.sectionInner}>
              <p className={styles.sectionLabel}>Nearby</p>
              <h2 id={`as-nearby-${section.id}`} className={styles.sectionTitle}>
                Local favorites
              </h2>
              <ul className={styles.nearbyGrid}>
                {section.items.map((item) => (
                  <li key={item.title} className={styles.nearbyItem}>
                    <h3 className={styles.nearbyTitle}>{item.title}</h3>
                    {item.text ? (
                      <p className={styles.unitText}>{item.text}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      }
      return (
        <section
          id="units"
          className={styles.section}
          data-testid="as-section-units"
          aria-labelledby={`as-units-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>Apartments</p>
            <h2 id={`as-units-${section.id}`} className={styles.sectionTitle}>
              Studios & apartments
            </h2>
            <div className={styles.unitList}>
              {section.items.map((item, index) => (
                <article key={item.title} className={styles.unitStrip}>
                  <div className={styles.unitMedia}>
                    <ApartmentsStudiosMedia
                      assetId={
                        [
                          APARTMENTS_STUDIOS_ASSET_IDS.gallery1,
                          APARTMENTS_STUDIOS_ASSET_IDS.gallery2,
                          APARTMENTS_STUDIOS_ASSET_IDS.split,
                        ][index % 3]
                      }
                      label={item.title}
                    />
                  </div>
                  <div className={styles.unitBody}>
                    <h3 className={styles.unitTitle}>{item.title}</h3>
                    {item.text ? (
                      <p className={styles.unitText}>{item.text}</p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      );

    case "gallery":
      return (
        <section
          id="gallery"
          className={styles.section}
          data-testid="as-section-gallery"
          aria-labelledby={`as-gallery-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>Gallery</p>
            <h2 id={`as-gallery-${section.id}`} className={styles.sectionTitle}>
              Spaces & light
            </h2>
            <div className={styles.galleryGrid}>
              {section.assetIds.length === 0 ? (
                <div className={styles.mediaFallback}>Gallery coming soon</div>
              ) : (
                section.assetIds.map((id, index) => (
                  <div key={id} className={styles.galleryItem}>
                    <ApartmentsStudiosMedia
                      assetId={id}
                      label={`Gallery photo ${index + 1}`}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      );

    case "amenities":
      return (
        <section
          id="amenities"
          className={styles.section}
          data-testid="as-section-amenities"
          aria-labelledby={`as-amenities-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>Amenities</p>
            <h2
              id={`as-amenities-${section.id}`}
              className={styles.sectionTitle}
            >
              Practical comforts
            </h2>
            <div className={styles.amenityPanel}>
              {section.displayMode === "custom" &&
              section.customItems?.length ? (
                <ul className={styles.chipRow}>
                  {section.customItems.map((item) => (
                    <li key={item.label}>{item.label}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.unitText}>
                  Amenities will appear here when configured for this property.
                </p>
              )}
            </div>
          </div>
        </section>
      );

    case "location":
      return (
        <section
          id="location"
          className={styles.section}
          data-testid="as-section-location"
          aria-labelledby={`as-location-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.locationGrid}`}>
            <div>
              <p className={styles.sectionLabel}>Location</p>
              <h2
                id={`as-location-${section.id}`}
                className={styles.sectionTitle}
              >
                Easy to reach, easy to explore
              </h2>
              {section.directionsText ? (
                <p className={styles.prose}>{section.directionsText}</p>
              ) : (
                <p className={styles.unitText}>
                  Destination details coming soon.
                </p>
              )}
            </div>
            {section.showMap ? (
              <div className={styles.mapSoft} aria-hidden>
                Map placeholder
              </div>
            ) : (
              <div className={styles.frame}>
                <ApartmentsStudiosMedia
                  assetId={APARTMENTS_STUDIOS_ASSET_IDS.gallery4}
                  label="Coastal vista"
                />
              </div>
            )}
          </div>
        </section>
      );

    case "faq":
      return (
        <section
          id="faq"
          className={styles.section}
          data-testid="as-section-faq"
          aria-labelledby={`as-faq-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>FAQ</p>
            <h2 id={`as-faq-${section.id}`} className={styles.sectionTitle}>
              Good to know
            </h2>
            <div className={styles.faqList}>
              {section.items.map((item) => (
                <details key={item.question} className={styles.faqItem}>
                  <summary>{item.question}</summary>
                  <div className={styles.faqAnswer}>{item.answer}</div>
                </details>
              ))}
            </div>
          </div>
        </section>
      );

    case "cta":
      return (
        <section
          id="reserve"
          className={styles.ctaBand}
          data-testid="as-section-cta"
          aria-labelledby={`as-cta-${section.id}`}
        >
          <h2 id={`as-cta-${section.id}`} className={styles.ctaTitle}>
            {section.headline}
          </h2>
          <a
            className={styles.btnPrimary}
            href={safeHref(section.buttonUrl) ?? "#reserve"}
          >
            {section.buttonLabel}
          </a>
        </section>
      );

    case "policies":
      return (
        <section
          className={styles.section}
          data-testid="as-section-policies"
          aria-label="Policies"
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>House notes</p>
            {section.items?.length ? (
              <ul className={styles.nearbyGrid}>
                {section.items.map((item) => (
                  <li key={item.title} className={styles.nearbyItem}>
                    <h3 className={styles.nearbyTitle}>{item.title}</h3>
                    <p className={styles.unitText}>{item.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      );

    default:
      return null;
  }
}
