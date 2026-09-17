import { MarketingButton } from "../MarketingButton";
import { SectionHeader } from "../SectionHeader";

export function PathsSection() {
  return (
    <section id="paths" className="talos-section border-b border-[var(--talos-line)]">
      <div className="talos-container">
        <SectionHeader
          kicker="Your property. Your choice."
          title="Two ways to work with Talos"
          lede="Use the platform to operate yourself — or partner with Talos for professional vacation-rental management, with visibility where the platform supports it."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <article className="flex flex-col border border-[var(--talos-line)] bg-white p-8 md:p-10">
            <p className="talos-kicker">Software</p>
            <h3 className="talos-display mt-3 text-3xl font-semibold tracking-tight">
              Manage it yourself
            </h3>
            <p className="mt-4 text-[var(--talos-muted)] leading-relaxed">
              Run reservations, properties, availability, pricing, guest records, team access, and
              grow a direct booking presence from a single operations workspace.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-[var(--talos-ink-soft)]">
              {[
                "Properties, units, and policies",
                "Availability calendar and bookings",
                "Direct booking presence",
                "Team members and operational tools",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-[var(--talos-forest)]">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <MarketingButton href="/pms">Explore the platform</MarketingButton>
            </div>
          </article>

          <article className="flex flex-col border border-[var(--talos-line)] bg-[var(--talos-ink)] p-8 text-[var(--talos-paper)] md:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--talos-sand)_80%,white)]">
              Managed service
            </p>
            <h3 className="talos-display mt-3 text-3xl font-semibold tracking-tight">
              Let Talos manage it
            </h3>
            <p className="mt-4 leading-relaxed text-white/70">
              Prefer to stay focused on ownership? Our team can operate the vacation rental on the
              same Talos platform — listing coordination, reservations, guest communication,
              distribution strategy, and owner visibility where supported.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              {[
                "Listing and reservation coordination",
                "Guest communication",
                "Distribution and direct presence strategy",
                "Owner visibility in Talos",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-[var(--talos-sand)]">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <MarketingButton href="/property-management" variant="on-dark">
                Explore property management
              </MarketingButton>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
