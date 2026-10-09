import type { ReactNode } from "react";
import type { WebsiteSection } from "@hcp/validators";
import { SAMPLE_ASSET_IDS } from "../../sample/sample-content";
import { sanitizeRichtextToReact } from "../../sanitize/richtext";
import { LuxuryVillaMedia } from "./LuxuryVillaMedia";
import styles from "./luxury-villa.module.css";

function isNearbyHighlights(section: Extract<WebsiteSection, { type: "highlights" }>) {
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

export type LuxuryVillaSectionOptions = {
  /**
   * Public-safe location line derived from validated website content
   * (e.g. location.directionsText). Omit when unavailable — never hardcode
   * a destination.
   */
  locationLabel?: string | null;
};

export function renderLuxuryVillaSection(
  section: WebsiteSection,
  options: LuxuryVillaSectionOptions = {},
): ReactNode {
  switch (section.type) {
    case "hero":
      return (
        <section
          id="top"
          className={styles.hero}
          data-testid="lv-section-hero"
          aria-label="Hero"
        >
          <div className={styles.heroMedia}>
            {section.backgroundAssetId ? (
              <LuxuryVillaMedia assetId={section.backgroundAssetId} />
            ) : (
              <div className={styles.heroFallback} aria-hidden />
            )}
          </div>
          <div className={styles.heroOverlay} aria-hidden />
          <div className={styles.heroContent}>
            {options.locationLabel ? (
              <p className={styles.eyebrow} data-testid="lv-hero-location">
                {options.locationLabel}
              </p>
            ) : null}
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
              <a className={styles.btnGhost} href="#gallery">
                View gallery
              </a>
            </div>
          </div>
        </section>
      );

    case "richtext":
      return (
        <section
          id="story"
          className={styles.section}
          data-testid="lv-section-intro"
          aria-labelledby={`lv-intro-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.introGrid}`}>
            <div>
              <p className={styles.sectionLabel}>The villa</p>
              <h2 id={`lv-intro-${section.id}`} className={styles.sectionTitle}>
                A quieter kind of grandeur
              </h2>
              <div className={styles.prose}>
                {sanitizeRichtextToReact(section.body)}
              </div>
            </div>
            <div className={styles.frame}>
              <LuxuryVillaMedia
                assetId={SAMPLE_ASSET_IDS.gallery1}
                label="Sunlit terrace"
              />
            </div>
          </div>
        </section>
      );

    case "split":
      return (
        <section
          className={styles.section}
          data-testid="lv-section-split"
          aria-labelledby={`lv-split-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.introGrid}`}>
            <div
              className={styles.frame}
              style={{ order: section.imagePosition === "right" ? 2 : 0 }}
            >
              <LuxuryVillaMedia assetId={section.assetId} label={section.headline} />
            </div>
            <div>
              <p className={styles.sectionLabel}>Stay</p>
              <h2 id={`lv-split-${section.id}`} className={styles.sectionTitle}>
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
      if (isNearbyHighlights(section)) {
        return (
          <section
            id="nearby"
            className={styles.section}
            data-testid="lv-section-nearby"
            aria-labelledby={`lv-nearby-${section.id}`}
          >
            <div className={styles.sectionInner}>
              <p className={styles.sectionLabel}>Nearby</p>
              <h2 id={`lv-nearby-${section.id}`} className={styles.sectionTitle}>
                Moments within reach
              </h2>
              <ul className={styles.nearbyList}>
                {section.items.map((item) => (
                  <li key={item.title}>
                    <h3 className={styles.nearbyTitle}>{item.title}</h3>
                    {item.text ? <p className={styles.suiteText}>{item.text}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      }
      return (
        <section
          id="stay"
          className={styles.section}
          data-testid="lv-section-accommodation"
          aria-labelledby={`lv-stay-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>Accommodation</p>
            <h2 id={`lv-stay-${section.id}`} className={styles.sectionTitle}>
              Suites with their own horizon
            </h2>
            <div className={styles.suiteGrid}>
              {section.items.map((item) => (
                <article key={item.title} className={styles.suiteCard}>
                  <h3 className={styles.suiteTitle}>{item.title}</h3>
                  {item.text ? <p className={styles.suiteText}>{item.text}</p> : null}
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
          data-testid="lv-section-gallery"
          aria-labelledby={`lv-gallery-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>Gallery</p>
            <h2 id={`lv-gallery-${section.id}`} className={styles.sectionTitle}>
              Light across stone and water
            </h2>
            <div className={styles.gallery}>
              {section.assetIds.length === 0 ? (
                <div className={styles.mediaFallback}>Gallery coming soon</div>
              ) : (
                section.assetIds.map((id, index) => (
                  <div key={id} className={styles.galleryItem}>
                    <LuxuryVillaMedia assetId={id} label={`Gallery image ${index + 1}`} />
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
          data-testid="lv-section-amenities"
          aria-labelledby={`lv-amenities-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>Amenities</p>
            <h2 id={`lv-amenities-${section.id}`} className={styles.sectionTitle}>
              Considered comforts
            </h2>
            {section.displayMode === "custom" && section.customItems?.length ? (
              <ul className={styles.amenityList}>
                {section.customItems.map((item) => (
                  <li key={item.label}>{item.label}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.suiteText}>
                Amenities will appear here when configured for this property.
              </p>
            )}
          </div>
        </section>
      );

    case "location":
      return (
        <section
          id="location"
          className={styles.section}
          data-testid="lv-section-location"
          aria-labelledby={`lv-location-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.locationBlock}`}>
            <div>
              <p className={styles.sectionLabel}>Location</p>
              <h2 id={`lv-location-${section.id}`} className={styles.sectionTitle}>
                Above a quiet harbor
              </h2>
              {section.directionsText ? (
                <p className={styles.prose}>{section.directionsText}</p>
              ) : (
                <p className={styles.suiteText}>Destination details coming soon.</p>
              )}
            </div>
            <div className={styles.frame}>
              <LuxuryVillaMedia
                assetId={SAMPLE_ASSET_IDS.gallery4}
                label="Pebble cove"
              />
            </div>
          </div>
        </section>
      );

    case "faq":
      return (
        <section
          id="faq"
          className={styles.section}
          data-testid="lv-section-faq"
          aria-labelledby={`lv-faq-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>FAQ</p>
            <h2 id={`lv-faq-${section.id}`} className={styles.sectionTitle}>
              Before you arrive
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
          data-testid="lv-section-cta"
          aria-labelledby={`lv-cta-${section.id}`}
        >
          <h2 id={`lv-cta-${section.id}`} className={styles.ctaTitle}>
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
          data-testid="lv-section-policies"
          aria-label="Policies"
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionLabel}>House notes</p>
            {section.items?.length ? (
              <ul className={styles.nearbyList}>
                {section.items.map((item) => (
                  <li key={item.title}>
                    <h3 className={styles.nearbyTitle}>{item.title}</h3>
                    <p className={styles.suiteText}>{item.body}</p>
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
