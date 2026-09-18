import type { Metadata } from "next";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { PresenceTransformation } from "@/components/marketing/ProductVisuals";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Branded property presence",
  description:
    "Turn Talos property data into a guest-facing branded presence — photos, details, and booking-ready experiences connected to the same system of record.",
  path: "/website-builder",
});

export default function WebsiteBuilderPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Talos branded property presence",
          description:
            "Guest-facing property presence powered by Talos property data and booking capabilities.",
          path: "/website-builder",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container max-w-3xl">
          <p className="talos-kicker">Property presence</p>
          <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Create your own branded property presence.
          </h1>
          <p className="talos-lede mt-5">
            Guests should meet your property on a presence that reflects your brand. Talos keeps
            property content and availability in one place — then helps you present that property to
            direct guests.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <MarketingButton href="/get-started?source=website_builder">
              Get started
            </MarketingButton>
            <MarketingButton href="/direct-bookings" variant="secondary">
              Direct booking journey
            </MarketingButton>
          </div>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container">
          <PresenceTransformation />
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              [
                "Property content",
                "Details and presentation stay attached to the property you already operate in Talos.",
              ],
              [
                "Brand experience",
                "A guest-facing presence designed around the property — desktop and mobile.",
              ],
              [
                "Connected to booking",
                "Availability and booking capability remain part of the same operational foundation.",
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container">
          <SectionHeader
            title="What ships today — and what is next"
            lede="Today Talos provides storefront capabilities and embeddable booking experiences that power a booking-ready presence from your property data. A full self-service CMS / one-click hosted marketing site generator is on the roadmap — this page markets the foundation that already exists, not a finished website studio."
          />
        </div>
      </section>
      <FinalCtaSection getStartedHref="/get-started?source=website_builder" />
    </>
  );
}
