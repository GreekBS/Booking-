import { MarketingButton } from "../MarketingButton";
import { HeroVisualComposition } from "../ProductVisuals";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--talos-line)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(232,226,214,0.85),transparent_55%),linear-gradient(180deg,var(--talos-paper),#efebe3)]"
      />
      <div className="talos-container relative grid items-center gap-10 py-12 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-20">
        <div>
          <p className="talos-kicker">Hospitality platform</p>
          <h1 className="talos-display mt-4 max-w-xl text-balance text-[2.35rem] font-semibold tracking-tight text-[var(--talos-ink)] sm:text-5xl lg:text-[3.35rem] lg:leading-[1.08]">
            Run your hospitality business. Build your own brand.
          </h1>
          <p className="talos-lede mt-5">
            Manage properties, reservations, distribution and your direct booking presence from
            Talos — or let our team manage the operation for you.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <MarketingButton href="/get-started?source=homepage_hero">
              Get started
            </MarketingButton>
            <MarketingButton href="/property-management" variant="secondary">
              Let Talos manage my property
            </MarketingButton>
          </div>
          <p className="mt-5 text-sm text-[var(--talos-muted)]">
            Run the software yourself. Grow a direct presence. Or let Talos operate on your behalf.
          </p>
        </div>

        <HeroVisualComposition />
      </div>
    </section>
  );
}
