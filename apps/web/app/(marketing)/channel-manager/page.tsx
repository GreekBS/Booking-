import type { Metadata } from "next";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Channel distribution",
  description:
    "Talos is built for multi-channel hospitality distribution with a provider-agnostic architecture. Connect channels as integrations mature — without rewriting operations.",
  path: "/channel-manager",
});

export default function ChannelManagerPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Talos channel distribution",
          description:
            "Provider-agnostic multi-channel distribution architecture for hospitality operators.",
          path: "/channel-manager",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container max-w-3xl">
          <p className="talos-kicker">Channel distribution</p>
          <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Built for multi-channel distribution.
          </h1>
          <p className="talos-lede mt-5">
            Talos includes a serious channel-management architecture designed so distribution
            providers can be added without fracturing your property and reservation system of
            record.
          </p>
          <div className="mt-8">
            <MarketingButton href="/register">Get started</MarketingButton>
          </div>
        </div>
      </section>
      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="talos-display text-2xl font-semibold">What we claim today</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--talos-muted)]">
              <li>A provider-agnostic distribution foundation inside the platform.</li>
              <li>
                Operational tooling for connections, credentials, and inventory workflows as
                capabilities are enabled for each environment.
              </li>
              <li>
                A design that pairs distribution with direct bookings — not one or the other.
              </li>
            </ul>
          </div>
          <div>
            <h2 className="talos-display text-2xl font-semibold">What we do not claim</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--talos-muted)]">
              <li>
                We do not advertise live, production-ready synchronization with every major OTA by
                name.
              </li>
              <li>
                Provider availability depends on environment configuration and ongoing integration
                work.
              </li>
              <li>We do not invent commission savings or occupancy promises from distribution.</li>
            </ul>
          </div>
        </div>
      </section>
      <FinalCtaSection />
    </>
  );
}
