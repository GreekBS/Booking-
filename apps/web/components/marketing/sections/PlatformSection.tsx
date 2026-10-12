import { SectionHeader } from "../SectionHeader";
import { OperationsDepthPanel } from "../ProductVisuals";
import { MarketingButton } from "../MarketingButton";

const CAPABILITIES = [
  {
    title: "Καταλύματα και μονάδες",
    body: "Δομή καταλόγου για βίλες, διαμερίσματα και πολυμονάδες διαμονές — με παροχές και πολιτικές.",
  },
  {
    title: "Διαθεσιμότητα και ημερολόγιο",
    body: "Καθαρή λειτουργική εικόνα διαμονών, δεσμεύσεων και ανοιχτού αποθέματος.",
  },
  {
    title: "Κρατήσεις",
    body: "Ροές εργασίας κρατήσεων που συνδέουν τη διαμονή του επισκέπτη με το ίδιο αρχείο καταλύματος.",
  },
  {
    title: "Εργαλεία τιμολόγησης",
    body: "Πλάνα τιμών και έλεγχοι τιμολόγησης για τις μονάδες που διαχειρίζεστε.",
  },
  {
    title: "Πρόσβαση ομάδας",
    body: "Μέλη και ρόλοι, ώστε τα σωστά άτομα να εκτελούν την καθημερινή εργασία.",
  },
  {
    title: "Αρχιτεκτονική έτοιμη για διανομή",
    body: "Σχεδιασμένο ώστε η πολυκαναλική διανομή να επεκτείνεται χωρίς να ξαναγράφονται οι βασικές λειτουργίες.",
  },
] as const;

export function PlatformSection() {
  return (
    <section id="platform" className="talos-section border-b border-[var(--talos-line)] bg-white">
      <div className="talos-container">
        <div className="grid items-start gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <div>
            <SectionHeader
              kicker="Λειτουργία"
              title="Λειτουργικό βάθος για ομάδες φιλοξενίας."
              lede="Το Talos είναι εκεί όπου ζουν τα καταλύματα, τα ημερολόγια και οι κρατήσεις — το σύστημα αναφοράς πίσω από τη ροή εργασίας του λογισμικού σας και, αν το επιλέξετε, την υπηρεσία διαχείρισής μας."
            />
            <div className="mt-8">
              <MarketingButton href="/pms">Εξερευνήστε την πλατφόρμα</MarketingButton>
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
