import { SectionHeader } from "../SectionHeader";

const SEGMENTS = [
  {
    title: "Ιδιοκτήτες καταλυμάτων",
    body: "Ιδιοκτήτες που θέλουν σαφέστερο έλεγχο, ισχυρότερη απευθείας παρουσία ή έναν επαγγελματία συνεργάτη για τη λειτουργία του καταλύματος.",
  },
  {
    title: "Διαχειριστές καταλυμάτων",
    body: "Επαγγελματίες που διαχειρίζονται πολλές βραχυχρόνιες μισθώσεις και χρειάζονται κεντρικό κατάλογο, ημερολόγιο και ροές κρατήσεων.",
  },
  {
    title: "Επιχειρήσεις φιλοξενίας",
    body: "Επαγγελματικές επιχειρήσεις διαμονής που χρειάζονται αξιόπιστο λογισμικό λειτουργιών και χώρο για ανάπτυξη της διανομής.",
  },
] as const;

export function SegmentsSection() {
  return (
    <section className="talos-section border-b border-[var(--talos-line)] bg-white">
      <div className="talos-container">
        <SectionHeader
          kicker="Για ποιους είναι το Talos"
          title="Σχεδιασμένο για ιδιοκτήτες και διαχειριστές."
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
