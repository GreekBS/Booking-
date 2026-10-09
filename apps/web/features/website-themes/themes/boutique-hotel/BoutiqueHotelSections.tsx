import type { ReactNode } from "react";
import type { WebsiteSection } from "@hcp/validators";
import { BOUTIQUE_HOTEL_ASSET_IDS } from "../../sample/sample-boutique-hotel";
import { sanitizeRichtextToReact } from "../../sanitize/richtext";
import { BoutiqueHotelMedia } from "./BoutiqueHotelMedia";
import styles from "./boutique-hotel.module.css";

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

export type BoutiqueHotelSectionOptions = {
  locationLabel?: string | null;
};

export function renderBoutiqueHotelSection(
  section: WebsiteSection,
  options: BoutiqueHotelSectionOptions = {},
): ReactNode {
  switch (section.type) {
    case "hero":
      return (
        <section
          id="top"
          className={styles.hero}
          data-testid="bh-section-hero"
          aria-label="Hero"
        >
          <div className={styles.heroCopy}>
            {options.locationLabel ? (
              <p className={styles.heroKicker} data-testid="bh-hero-location">
                {options.locationLabel}
              </p>
            ) : (
              <p className={styles.heroKicker}>Boutique hotel</p>
            )}
            <h1 className={styles.heroTitle}>{section.headline}</h1>
            {section.subheadline ? (
              <p className={styles.heroLead}>{section.subheadline}</p>
            ) : null}
            <div className={styles.heroActions}>
              {section.ctaLabel ? (
                <a
                  className={styles.btnSolid}
                  href={safeHref(section.ctaUrl) ?? "#reserve"}
                >
                  {section.ctaLabel}
                </a>
              ) : null}
              <a className={styles.btnLine} href="#rooms">
                View rooms
              </a>
            </div>
          </div>
          <div className={styles.heroMedia}>
            {section.backgroundAssetId ? (
              <BoutiqueHotelMedia assetId={section.backgroundAssetId} />
            ) : (
              <div className={styles.mediaFallback} aria-hidden>
                Facade
              </div>
            )}
          </div>
        </section>
      );

    case "richtext":
      return (
        <section
          id="story"
          className={styles.section}
          data-testid="bh-section-intro"
          aria-labelledby={`bh-intro-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.introGrid}`}>
            <div>
              <p className={styles.sectionIndex}>01 — The house</p>
              <h2 id={`bh-intro-${section.id}`} className={styles.sectionTitle}>
                A smaller hotel, carefully composed
              </h2>
              <div className={styles.prose}>
                {sanitizeRichtextToReact(section.body)}
              </div>
            </div>
            <div className={styles.frame}>
              <BoutiqueHotelMedia
                assetId={BOUTIQUE_HOTEL_ASSET_IDS.gallery2}
                label="Courtyard"
              />
            </div>
          </div>
        </section>
      );

    case "split":
      return (
        <section
          className={styles.section}
          data-testid="bh-section-split"
          aria-labelledby={`bh-split-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.introGrid}`}>
            <div
              className={styles.frame}
              style={{ order: section.imagePosition === "left" ? 0 : 2 }}
            >
              <BoutiqueHotelMedia
                assetId={section.assetId}
                label={section.headline}
              />
            </div>
            <div>
              <p className={styles.sectionIndex}>02 — Craft</p>
              <h2 id={`bh-split-${section.id}`} className={styles.sectionTitle}>
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
            data-testid="bh-section-nearby"
            aria-labelledby={`bh-nearby-${section.id}`}
          >
            <div className={styles.sectionInner}>
              <p className={styles.sectionIndex}>06 — Neighborhood</p>
              <h2 id={`bh-nearby-${section.id}`} className={styles.sectionTitle}>
                Within a short walk
              </h2>
              <ul className={styles.nearbyList}>
                {section.items.map((item) => (
                  <li key={item.title}>
                    <h3 className={styles.nearbyTitle}>{item.title}</h3>
                    {item.text ? (
                      <p className={styles.roomText}>{item.text}</p>
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
          id="rooms"
          className={styles.section}
          data-testid="bh-section-rooms"
          aria-labelledby={`bh-rooms-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionIndex}>03 — Rooms</p>
            <h2 id={`bh-rooms-${section.id}`} className={styles.sectionTitle}>
              Rooms & suites
            </h2>
            <div className={styles.roomList}>
              {section.items.map((item, index) => (
                <article key={item.title} className={styles.roomRow}>
                  <div className={styles.roomMeta}>
                    <p className={styles.roomNum}>
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className={styles.roomTitle}>{item.title}</h3>
                    {item.text ? (
                      <p className={styles.roomText}>{item.text}</p>
                    ) : null}
                  </div>
                  <div className={styles.roomMedia}>
                    <BoutiqueHotelMedia
                      assetId={
                        [
                          BOUTIQUE_HOTEL_ASSET_IDS.gallery1,
                          BOUTIQUE_HOTEL_ASSET_IDS.gallery2,
                          BOUTIQUE_HOTEL_ASSET_IDS.gallery3,
                        ][index % 3]
                      }
                      label={item.title}
                    />
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
          data-testid="bh-section-gallery"
          aria-labelledby={`bh-gallery-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionIndex}>04 — Gallery</p>
            <h2 id={`bh-gallery-${section.id}`} className={styles.sectionTitle}>
              Quiet frames
            </h2>
            <div className={styles.film}>
              {section.assetIds.length === 0 ? (
                <div className={styles.mediaFallback}>Gallery coming soon</div>
              ) : (
                section.assetIds.map((id, index) => (
                  <div key={id} className={styles.band}>
                    <div className={styles.bandMedia}>
                      <BoutiqueHotelMedia
                        assetId={id}
                        label={`Gallery frame ${index + 1}`}
                      />
                    </div>
                    <span className={styles.bandCaption}>
                      Frame {String(index + 1).padStart(2, "0")}
                    </span>
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
          data-testid="bh-section-amenities"
          aria-labelledby={`bh-amenities-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionIndex}>05 — Amenities</p>
            <h2
              id={`bh-amenities-${section.id}`}
              className={styles.sectionTitle}
            >
              House services
            </h2>
            {section.displayMode === "custom" && section.customItems?.length ? (
              <ul className={styles.amenityCols}>
                {section.customItems.map((item) => (
                  <li key={item.label}>{item.label}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.roomText}>
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
          className={`${styles.section} ${styles.locationBand}`}
          data-testid="bh-section-location"
          aria-labelledby={`bh-location-${section.id}`}
        >
          <div className={`${styles.sectionInner} ${styles.locationGrid}`}>
            <div>
              <p className={styles.sectionIndex}>Location</p>
              <h2
                id={`bh-location-${section.id}`}
                className={styles.sectionTitle}
              >
                A quiet street address
              </h2>
              {section.directionsText ? (
                <p className={styles.prose}>{section.directionsText}</p>
              ) : (
                <p className={styles.roomText}>Destination details coming soon.</p>
              )}
            </div>
            <div className={styles.frame}>
              <BoutiqueHotelMedia
                assetId={BOUTIQUE_HOTEL_ASSET_IDS.gallery4}
                label="Street facade"
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
          data-testid="bh-section-faq"
          aria-labelledby={`bh-faq-${section.id}`}
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionIndex}>07 — FAQ</p>
            <h2 id={`bh-faq-${section.id}`} className={styles.sectionTitle}>
              Practical notes
            </h2>
            <div className={styles.faqStack}>
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
          data-testid="bh-section-cta"
          aria-labelledby={`bh-cta-${section.id}`}
        >
          <h2 id={`bh-cta-${section.id}`} className={styles.ctaTitle}>
            {section.headline}
          </h2>
          <a
            className={styles.btnSolid}
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
          data-testid="bh-section-policies"
          aria-label="Policies"
        >
          <div className={styles.sectionInner}>
            <p className={styles.sectionIndex}>House notes</p>
            {section.items?.length ? (
              <ul className={styles.nearbyList}>
                {section.items.map((item) => (
                  <li key={item.title}>
                    <h3 className={styles.nearbyTitle}>{item.title}</h3>
                    <p className={styles.roomText}>{item.body}</p>
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
