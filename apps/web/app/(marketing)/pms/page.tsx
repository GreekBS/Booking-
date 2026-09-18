import type { Metadata } from "next";
import Link from "next/link";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { ProductShell } from "@/components/marketing/ProductVisuals";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Property management system",
  description:
    "Talos PMS helps hospitality operators manage properties, units, availability, bookings, guests, and team access from one workspace.",
  path: "/pms",
});

export default function PmsPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Talos Property Management System",
          description:
            "Hospitality operations software for properties, availability, bookings, and team collaboration.",
          path: "/pms",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="talos-kicker">PMS</p>
            <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              A property management system built for vacation rentals.
            </h1>
            <p className="talos-lede mt-5">
              Organize your catalog, stay calendar, reservations, guest records, and team
              permissions in one place — then connect distribution and direct booking when you are
              ready.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MarketingButton href="/get-started?source=pms">Get started</MarketingButton>
              <MarketingButton href="/website-builder" variant="secondary">
                Property presence
              </MarketingButton>
            </div>
          </div>
          <ProductShell />
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container">
          <SectionHeader
            title="What you operate in Talos"
            lede="The admin workspace covers the operational surfaces hospitality teams use every day."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Properties & units", "Catalog structure for villas, apartments, and multi-unit stays."],
              ["Availability", "Calendar views, blocks, and stay rules that keep inventory coherent."],
              ["Bookings", "Reservation workflows including manual booking support."],
              ["Pricing", "Rate plans and pricing tools for your units."],
              ["Guests & members", "Guest records and team access with role-aware permissions."],
              ["Policies & amenities", "House rules and amenity catalogs that stay attached to the property."],
            ].map(([title, body]) => (
              <div key={title} className="border-t border-[var(--talos-line)] pt-4">
                <h2 className="font-semibold text-[var(--talos-ink)]">{title}</h2>
                <p className="mt-2 text-sm text-[var(--talos-muted)]">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-sm text-[var(--talos-muted)]">
            Prefer not to run operations yourself?{" "}
            <Link href="/property-management" className="underline underline-offset-4">
              Explore full property management
            </Link>
            .
          </p>
        </div>
      </section>
      <FinalCtaSection getStartedHref="/get-started?source=pms" />
    </>
  );
}
