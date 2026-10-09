import type { ReactNode } from "react";
import type { WebsiteSection } from "@hcp/validators";
import { sanitizeRichtextToReact } from "../sanitize/richtext";

/**
 * Neutral foundation section adapters for B1.
 * Themes own chrome/layout; these views are intentionally non-branded so B2+
 * can replace theme Layouts without sharing a “SaaS landing” look.
 */

const shellClass =
  "wb-section border-b border-neutral-200 px-4 py-8 last:border-b-0 sm:px-6";

function SectionChrome({
  title,
  children,
  testId,
}: {
  title?: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section className={shellClass} data-testid={testId}>
      {title ? (
        <h2 className="mb-3 text-lg font-semibold tracking-tight text-neutral-900">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function AssetPlaceholder({ id, label }: { id: string; label: string }) {
  const hue =
    [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
  return (
    <div
      className="flex aspect-[4/3] items-center justify-center rounded-md text-xs text-white/90"
      style={{ background: `hsl(${hue} 28% 42%)` }}
      aria-label={label}
      data-asset-id={id}
    >
      {label}
    </div>
  );
}

export function renderFoundationSection(section: WebsiteSection): ReactNode {
  switch (section.type) {
    case "hero":
      return (
        <SectionChrome testId="wb-section-hero">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            Hero
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
            {section.headline}
          </h1>
          {section.subheadline ? (
            <p className="mt-3 max-w-2xl text-base text-neutral-600">
              {section.subheadline}
            </p>
          ) : null}
          {section.ctaLabel ? (
            <p className="mt-5">
              <span className="inline-flex rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
                {section.ctaLabel}
              </span>
            </p>
          ) : null}
        </SectionChrome>
      );
    case "richtext":
      return (
        <SectionChrome title="About" testId="wb-section-richtext">
          <div className="prose-neutral max-w-3xl space-y-3 text-sm leading-relaxed text-neutral-700">
            {sanitizeRichtextToReact(section.body)}
          </div>
        </SectionChrome>
      );
    case "gallery":
      return (
        <SectionChrome title="Gallery" testId="wb-section-gallery">
          <div
            className={
              section.layout === "carousel"
                ? "flex gap-3 overflow-x-auto pb-2"
                : "grid grid-cols-2 gap-3 sm:grid-cols-3"
            }
          >
            {section.assetIds.length === 0 ? (
              <p className="text-sm text-neutral-500">No images yet.</p>
            ) : (
              section.assetIds.map((id, i) => (
                <AssetPlaceholder
                  key={id}
                  id={id}
                  label={`Photo ${i + 1}`}
                />
              ))
            )}
          </div>
        </SectionChrome>
      );
    case "amenities":
      return (
        <SectionChrome title="Amenities" testId="wb-section-amenities">
          {section.displayMode === "custom" && section.customItems?.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {section.customItems.map((item) => (
                <li
                  key={item.label}
                  className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-800"
                >
                  {item.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">
              Amenities will sync from the property catalog when configured.
            </p>
          )}
        </SectionChrome>
      );
    case "highlights":
      return (
        <SectionChrome title="Highlights" testId="wb-section-highlights">
          <ul className="grid gap-3 sm:grid-cols-2">
            {section.items.map((item) => (
              <li
                key={item.title}
                className="rounded-md border border-neutral-200 p-3"
              >
                <p className="font-medium text-neutral-900">{item.title}</p>
                {item.text ? (
                  <p className="mt-1 text-sm text-neutral-600">{item.text}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionChrome>
      );
    case "location":
      return (
        <SectionChrome title="Location" testId="wb-section-location">
          {section.directionsText ? (
            <p className="max-w-2xl text-sm leading-relaxed text-neutral-700">
              {section.directionsText}
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Location details coming soon.</p>
          )}
          {section.showMap ? (
            <div
              className="mt-4 flex h-36 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-500"
              aria-hidden
            >
              Map placeholder (preview only)
            </div>
          ) : null}
        </SectionChrome>
      );
    case "faq":
      return (
        <SectionChrome title="FAQ" testId="wb-section-faq">
          <dl className="space-y-4">
            {section.items.map((item) => (
              <div key={item.question}>
                <dt className="font-medium text-neutral-900">{item.question}</dt>
                <dd className="mt-1 text-sm text-neutral-600">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </SectionChrome>
      );
    case "cta":
      return (
        <SectionChrome testId="wb-section-cta">
          <div className="rounded-lg bg-neutral-900 px-5 py-8 text-center text-white">
            <p className="text-xl font-semibold">{section.headline}</p>
            <p className="mt-4">
              <span className="inline-flex rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900">
                {section.buttonLabel}
              </span>
            </p>
          </div>
        </SectionChrome>
      );
    case "split":
      return (
        <SectionChrome testId="wb-section-split">
          <div
            className={`grid gap-4 sm:grid-cols-2 ${
              section.imagePosition === "right" ? "" : ""
            }`}
          >
            <div
              className={
                section.imagePosition === "right" ? "sm:order-2" : "sm:order-1"
              }
            >
              {section.assetId ? (
                <AssetPlaceholder id={section.assetId} label="Feature" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-500">
                  Image
                </div>
              )}
            </div>
            <div
              className={
                section.imagePosition === "right" ? "sm:order-1" : "sm:order-2"
              }
            >
              <h2 className="text-xl font-semibold text-neutral-900">
                {section.headline}
              </h2>
              <div className="mt-3 text-sm leading-relaxed text-neutral-700">
                {sanitizeRichtextToReact(section.body)}
              </div>
            </div>
          </div>
        </SectionChrome>
      );
    case "policies":
      return (
        <SectionChrome title="Policies" testId="wb-section-policies">
          {section.items?.length ? (
            <ul className="space-y-3">
              {section.items.map((item) => (
                <li key={item.title}>
                  <p className="font-medium text-neutral-900">{item.title}</p>
                  <p className="mt-1 text-sm text-neutral-600">{item.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No policies listed.</p>
          )}
        </SectionChrome>
      );
    default:
      return null;
  }
}
