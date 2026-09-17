import { SectionHeader } from "../SectionHeader";
import { MarketingButton } from "../MarketingButton";

export function DistributionSection() {
  return (
    <section className="talos-section border-b border-[var(--talos-line)] bg-white">
      <div className="talos-container">
        <SectionHeader
          kicker="Distribution + brand"
          title="Distribution brings guests. Your brand brings them back."
          lede="Talos helps hospitality businesses participate in multi-channel distribution while building a durable direct presence — operations and guest experience connected through one platform."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div className="border border-[var(--talos-line)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
              Distribution channels
            </p>
            <p className="mt-3 text-lg font-semibold text-[var(--talos-ink)]">
              Reach guests where they already search
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">
              A provider-agnostic distribution architecture is designed so channels can be connected
              as integrations become ready — without rewriting your core operations.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-2 py-4">
            <div className="talos-display rounded-sm bg-[var(--talos-ink)] px-5 py-3 text-2xl font-semibold text-[var(--talos-paper)]">
              TALOS
            </div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--talos-muted)]">Hub</p>
          </div>

          <div className="grid gap-4">
            <div className="border border-[var(--talos-line)] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
                Operations
              </p>
              <p className="mt-3 text-lg font-semibold">Stay in control of the business</p>
              <p className="mt-2 text-sm text-[var(--talos-muted)]">
                Reservations, availability, and property data remain in Talos.
              </p>
            </div>
            <div className="border border-[var(--talos-forest)]/30 bg-[var(--talos-forest)]/5 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-forest)]">
                Own website
              </p>
              <p className="mt-3 text-lg font-semibold">Direct guests on your brand</p>
              <p className="mt-2 text-sm text-[var(--talos-muted)]">
                A guest-facing presence that reflects the property — and routes bookings through your
                stack.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <MarketingButton href="/direct-bookings" variant="secondary">
            Explore direct bookings
          </MarketingButton>
        </div>
      </div>
    </section>
  );
}
