import { MarketingButton } from "../MarketingButton";
import { SectionHeader } from "../SectionHeader";

const STEPS = [
  "Add your property and units",
  "Configure availability, pricing, and policies",
  "Prepare distribution as channels become available",
  "Launch your direct booking presence",
  "Run day-to-day operations from Talos",
] as const;

export function HowItWorksSection() {
  return (
    <section className="talos-section border-b border-[var(--talos-line)]">
      <div className="talos-container">
        <SectionHeader
          kicker="How it works"
          title="A clear path from property to operation."
          lede="For software customers, Talos follows a practical sequence grounded in what the platform already supports."
        />
        <ol className="mt-10 space-y-0 border-l border-[var(--talos-line)] ml-3">
          {STEPS.map((step, index) => (
            <li key={step} className="relative py-4 pl-8">
              <span className="absolute -left-[5px] top-6 h-2.5 w-2.5 rounded-full bg-[var(--talos-forest)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
                Step {index + 1}
              </p>
              <p className="mt-1 text-lg font-medium text-[var(--talos-ink)]">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 border border-[var(--talos-line)] bg-[var(--talos-sand)]/40 p-6 md:p-8">
          <p className="talos-display text-2xl font-semibold tracking-tight">
            Don&apos;t want to manage it yourself?
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--talos-muted)]">
            Talos can manage the property for you — while you retain visibility through the platform
            where supported.
          </p>
          <div className="mt-6">
            <MarketingButton href="/property-management" variant="secondary">
              Explore property management
            </MarketingButton>
          </div>
        </div>
      </div>
    </section>
  );
}
