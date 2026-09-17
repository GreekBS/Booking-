import { SectionHeader } from "../SectionHeader";

const SEGMENTS = [
  {
    title: "Property owners",
    body: "Owners who want clearer control, a stronger direct presence, or a professional partner to operate the property.",
  },
  {
    title: "Property managers",
    body: "Operators running multiple vacation rentals who need centralized catalog, calendar, and booking workflows.",
  },
  {
    title: "Hospitality businesses",
    body: "Professional accommodation businesses that need dependable operations software and room to grow distribution.",
  },
] as const;

export function SegmentsSection() {
  return (
    <section className="talos-section border-b border-[var(--talos-line)] bg-white">
      <div className="talos-container">
        <SectionHeader
          kicker="Who Talos is for"
          title="Built for owners and operators alike."
          align="center"
        />
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {SEGMENTS.map((segment) => (
            <article key={segment.title} className="text-center md:text-left">
              <h3 className="talos-display text-2xl font-semibold tracking-tight">
                {segment.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--talos-muted)]">
                {segment.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
