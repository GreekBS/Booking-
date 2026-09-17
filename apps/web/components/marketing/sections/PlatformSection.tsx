import { SectionHeader } from "../SectionHeader";
import { OperationsDepthPanel } from "../ProductVisuals";
import { MarketingButton } from "../MarketingButton";

const CAPABILITIES = [
  {
    title: "Properties & units",
    body: "Catalog structure for villas, apartments, and multi-unit stays — with amenities and policies attached.",
  },
  {
    title: "Availability & calendar",
    body: "A clear operational picture of stays, blocks, and open inventory.",
  },
  {
    title: "Reservations",
    body: "Booking workflows that keep guest stays connected to the same property record.",
  },
  {
    title: "Pricing tools",
    body: "Rate plans and pricing controls for units you operate.",
  },
  {
    title: "Team access",
    body: "Members and roles so the right people can run day-to-day work.",
  },
  {
    title: "Distribution-ready architecture",
    body: "Built so multi-channel distribution can expand without rewriting your core operations.",
  },
] as const;

export function PlatformSection() {
  return (
    <section id="platform" className="talos-section border-b border-[var(--talos-line)] bg-white">
      <div className="talos-container">
        <div className="grid items-start gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <div>
            <SectionHeader
              kicker="Run"
              title="Operational depth for hospitality teams."
              lede="Talos is where properties, calendars, and reservations live — the system of record behind both your software workflow and, when you choose, our managed service."
            />
            <div className="mt-8">
              <MarketingButton href="/pms">Explore the platform</MarketingButton>
            </div>
          </div>
          <OperationsDepthPanel />
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <div key={item.title} className="border-t border-[var(--talos-line)] pt-5">
              <h3 className="text-base font-semibold text-[var(--talos-ink)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
