import type { Metadata } from "next";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Direct bookings",
  description:
    "Accept bookings through your own channels with Talos — availability checks, quotes, holds, and reservations connected to your operations workspace.",
  path: "/direct-bookings",
});

export default function DirectBookingsPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Talos direct bookings",
          description:
            "Direct booking journeys via storefront APIs and embeddable widgets, integrated with Talos operations.",
          path: "/direct-bookings",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container max-w-3xl">
          <p className="talos-kicker">Direct bookings</p>
          <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Accept bookings through your own channels.
          </h1>
          <p className="talos-lede mt-5">
            Distribution can bring discovery. Direct bookings keep the guest relationship closer to
            your brand. Talos supports availability checks, quotes, holds, and bookings through
            storefront APIs and embeddable widgets — while reservations stay in the same operational
            picture.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <MarketingButton href="/register">Get started</MarketingButton>
            <MarketingButton href="/website-builder" variant="secondary">
              Branded property presence
            </MarketingButton>
          </div>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container">
          <h2 className="talos-display text-3xl font-semibold tracking-tight">
            The direct booking journey
          </h2>
          <ol className="mt-8 space-y-0 border-l border-[var(--talos-line)] ml-3">
            {[
              ["Discover", "A guest reaches your property through your own presence or channels."],
              ["Check availability", "Dates and inventory are evaluated against Talos operational data."],
              ["Quote & hold", "Storefront flows support pricing quotes and temporary holds."],
              ["Book", "The reservation lands in Talos — the same system that runs day-to-day operations."],
            ].map(([title, body], index) => (
              <li key={title} className="relative py-4 pl-8">
                <span className="absolute -left-[5px] top-6 h-2.5 w-2.5 rounded-full bg-[var(--talos-forest)]" />
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
                  Step {index + 1}
                </p>
                <p className="mt-1 text-lg font-medium text-[var(--talos-ink)]">{title}</p>
                <p className="mt-1 text-sm text-[var(--talos-muted)]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container grid gap-8 md:grid-cols-3">
          {[
            [
              "Storefront APIs",
              "Property, availability, quote, hold, and booking endpoints designed for guest-facing products.",
            ],
            [
              "Embeddable widgets",
              "React and embed packages so booking flows can live on sites and pages you control.",
            ],
            [
              "Operational integration",
              "Direct-channel reservations remain visible alongside the rest of your Talos workspace.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="border-t border-[var(--talos-line)] pt-4">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-[var(--talos-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>
      <FinalCtaSection />
    </>
  );
}
