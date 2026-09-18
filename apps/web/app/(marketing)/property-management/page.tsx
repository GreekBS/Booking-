import type { Metadata } from "next";
import Image from "next/image";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Full property management",
  description:
    "Let Talos manage your vacation rental for a commission — listing coordination, reservations, guest communication, and owner visibility through the platform.",
  path: "/property-management",
});

export default function PropertyManagementPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Talos full property management",
          description:
            "Professional vacation rental management with owner visibility through the Talos platform.",
          path: "/property-management",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="talos-kicker">Managed service</p>
            <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Prefer to leave the operations to us?
            </h1>
            <p className="talos-lede mt-5">
              Talos is both a hospitality technology company and a management partner. Owners can
              choose professional vacation-rental management while retaining visibility through the
              platform where supported.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MarketingButton href="/get-started?source=property_management">
                Talk to us about property management
              </MarketingButton>
              <MarketingButton href="/get-started?source=pms" variant="secondary">
                Or run it yourself
              </MarketingButton>
            </div>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm border border-[var(--talos-line)]">
            <Image
              src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80"
              alt="Modern villa living space with large windows"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 40vw"
            />
          </div>
        </div>
      </section>
      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container">
          <h2 className="talos-display text-3xl font-semibold">Services we discuss with owners</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {[
              "Listing management and presentation",
              "Reservation coordination",
              "Guest communication",
              "Distribution and direct-presence strategy",
              "Pricing and revenue support conversations",
              "Owner reporting and platform visibility",
            ].map((item) => (
              <p
                key={item}
                className="border-t border-[var(--talos-line)] pt-4 text-sm text-[var(--talos-ink-soft)]"
              >
                {item}
              </p>
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-sm text-[var(--talos-muted)]">
            Commission models, coverage hours, and on-the-ground services are agreed per engagement.
            This page does not publish guarantees for occupancy, revenue, or response SLAs.
          </p>
        </div>
      </section>
      <FinalCtaSection getStartedHref="/get-started?source=property_management" />
    </>
  );
}
