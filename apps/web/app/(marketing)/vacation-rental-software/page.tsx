import type { Metadata } from "next";
import Link from "next/link";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Vacation rental software",
  description:
    "How Talos helps vacation-rental operators run properties, take reservations, grow a direct presence, participate in distribution, and optionally hand operations to a managed team.",
  path: "/vacation-rental-software",
});

export default function VacationRentalSoftwarePage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Talos vacation rental software",
          description:
            "Vacation rental software for operations, direct bookings, distribution architecture, and optional managed service.",
          path: "/vacation-rental-software",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container max-w-3xl">
          <p className="talos-kicker">Vacation rental software</p>
          <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            How Talos helps you operate a vacation-rental business.
          </h1>
          <p className="talos-lede mt-5">
            Running vacation rentals means juggling catalog, calendar, guests, distribution, and
            brand. Talos is built as one operating platform for that work — with the option to let
            our team manage the property when you prefer a partner.
          </p>
          <div className="mt-8">
            <MarketingButton href="/register">Get started</MarketingButton>
          </div>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container space-y-10">
          {[
            {
              href: "/pms",
              kicker: "01 · Run",
              title: "Operate the property day to day",
              body: "Add properties and units, manage availability and pricing, take reservations, and keep guest and team records in one workspace.",
            },
            {
              href: "/channel-manager",
              kicker: "02 · Distribute",
              title: "Participate in multi-channel distribution",
              body: "Talos includes a provider-agnostic distribution architecture so channels can expand as integrations mature — without fracturing your system of record.",
            },
            {
              href: "/website-builder",
              kicker: "03 · Grow",
              title: "Build a direct brand presence",
              body: "Use the same property data to power a guest-facing presence — so discovery is not only dependent on third-party listings.",
            },
            {
              href: "/direct-bookings",
              kicker: "04 · Convert",
              title: "Accept direct bookings",
              body: "Availability checks, quotes, holds, and bookings through storefront APIs and widgets stay connected to Talos operations.",
            },
            {
              href: "/property-management",
              kicker: "05 · Or hand it over",
              title: "Optional full property management",
              body: "Prefer not to operate the software yourself? Talos can manage the vacation rental on the same platform — with owner visibility where supported.",
            },
          ].map((item) => (
            <article
              key={item.href}
              className="grid gap-4 border-t border-[var(--talos-line)] pt-8 md:grid-cols-[10rem_1fr_auto] md:items-start"
            >
              <p className="talos-kicker">{item.kicker}</p>
              <div>
                <h2 className="talos-display text-2xl font-semibold tracking-tight">
                  {item.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--talos-muted)]">
                  {item.body}
                </p>
              </div>
              <Link
                href={item.href}
                className="text-sm font-semibold text-[var(--talos-forest)] underline-offset-4 hover:underline md:pt-1"
              >
                Learn more
              </Link>
            </article>
          ))}
        </div>
      </section>
      <FinalCtaSection />
    </>
  );
}
