/**
 * Proof architecture placeholders — render only factual content.
 * Fake testimonials/metrics must never be added here.
 */

import { SectionHeader } from "../SectionHeader";
import { ProductShell } from "../ProductVisuals";

export function ProofFoundationSection() {
  return (
    <section className="talos-section border-b border-[var(--talos-line)] bg-white">
      <div className="talos-container">
        <SectionHeader
          kicker="Proof"
          title="Built to showcase real results as they arrive."
          lede="Case studies, testimonials, and portfolio metrics will live here when verified. Until then, we show the product and the hospitality standard we design for — not invented numbers."
        />
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div className="border border-dashed border-[var(--talos-line)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
              Coming soon
            </p>
            <ul className="mt-4 space-y-3 text-sm text-[var(--talos-ink-soft)]">
              <li>Case studies</li>
              <li>Owner & operator testimonials</li>
              <li>Customer metrics</li>
              <li>Property portfolio highlights</li>
            </ul>
          </div>
          <ProductShell caption="Talos product preview while public proof is collected" />
        </div>
      </div>
    </section>
  );
}
