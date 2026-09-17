import { MarketingButton } from "../MarketingButton";
import { SectionHeader } from "../SectionHeader";
import { PresenceTransformation } from "../ProductVisuals";

export function WebsiteBuilderSection() {
  return (
    <section id="direct-presence" className="talos-section border-b border-[var(--talos-line)]">
      <div className="talos-container">
        <SectionHeader
          kicker="Direct presence"
          title="Your property. Your brand. Direct guests."
          lede="The property information you already run in Talos can power a guest-facing presence — so visitors discover your brand and book through channels you control."
        />

        <div className="mt-12">
          <PresenceTransformation />
        </div>

        <div className="mt-10 grid gap-6 border-t border-[var(--talos-line)] pt-8 md:grid-cols-3">
          {[
            [
              "One property record",
              "Photos, details, and availability stay authoritative in Talos — then surface to guests.",
            ],
            [
              "Booking-ready presence",
              "Embeddable booking experiences and storefront capabilities turn that data into a direct path to reserve.",
            ],
            [
              "Brand you own",
              "Guests meet your property on a presence that reflects you — not only a third-party listing.",
            ],
          ].map(([title, body]) => (
            <div key={title}>
              <h3 className="text-base font-semibold text-[var(--talos-ink)]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-relaxed text-[var(--talos-muted)]">
            Talos is not a one-click CMS today. It is the operational foundation for a booking-ready
            web presence — with deeper site-builder tooling on the roadmap.
          </p>
          <MarketingButton href="/website-builder">Explore your property presence</MarketingButton>
        </div>
      </div>
    </section>
  );
}
