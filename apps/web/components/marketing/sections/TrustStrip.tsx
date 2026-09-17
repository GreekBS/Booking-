export function TrustStrip() {
  return (
    <section className="border-b border-[var(--talos-line)] bg-white">
      <div className="talos-container grid gap-6 py-10 md:grid-cols-3 md:gap-8">
        {[
          {
            title: "Run",
            body: "Hospitality operations software for properties, calendars, and reservations.",
          },
          {
            title: "Grow",
            body: "A direct booking presence powered by the same property data you already manage.",
          },
          {
            title: "Or let Talos manage it",
            body: "Professional vacation-rental management on the same operating platform.",
          },
        ].map((item) => (
          <div key={item.title}>
            <h2 className="text-sm font-semibold tracking-wide text-[var(--talos-ink)]">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
