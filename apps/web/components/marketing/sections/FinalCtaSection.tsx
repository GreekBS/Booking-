import { MarketingButton } from "../MarketingButton";

export function FinalCtaSection() {
  return (
    <section className="talos-section bg-[var(--talos-ink)] text-[var(--talos-paper)]">
      <div className="talos-container max-w-3xl text-center">
        <h2 className="talos-display text-balance text-3xl font-semibold tracking-tight md:text-5xl md:leading-[1.1]">
          Run it yourself. Or let us run it with you.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/70">
          Talos gives hospitality businesses the technology to operate independently — and the
          option of professional management when they want a partner.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <MarketingButton href="/register" variant="on-dark">
            Get started with Talos
          </MarketingButton>
          <MarketingButton
            href="/contact"
            variant="secondary"
            className="border-white/30 text-[var(--talos-paper)] hover:border-white/60"
          >
            Talk to our management team
          </MarketingButton>
        </div>
      </div>
    </section>
  );
}
