export function TrustStrip() {
  return (
    <section className="border-b border-[var(--talos-line)] bg-white">
      <div className="talos-container grid gap-6 py-10 md:grid-cols-3 md:gap-8">
        {[
          {
            title: "Λειτουργία",
            body: "Λογισμικό λειτουργιών φιλοξενίας για καταλύματα, ημερολόγια και κρατήσεις.",
          },
          {
            title: "Ανάπτυξη",
            body: "Απευθείας παρουσία κρατήσεων, με βάση τα ίδια δεδομένα καταλύματος που ήδη διαχειρίζεστε.",
          },
          {
            title: "Ή αφήστε το Talos να το διαχειριστεί",
            body: "Επαγγελματική διαχείριση βραχυχρόνιας μίσθωσης στην ίδια πλατφόρμα λειτουργίας.",
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
