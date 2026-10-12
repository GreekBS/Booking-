import { MarketingButton } from "../MarketingButton";
import { SectionHeader } from "../SectionHeader";

const STEPS = [
  "Προσθέστε το κατάλυμα και τις μονάδες σας",
  "Ρυθμίστε διαθεσιμότητα, τιμές και πολιτικές",
  "Προετοιμάστε τη διανομή καθώς τα κανάλια γίνονται διαθέσιμα",
  "Ενεργοποιήστε την απευθείας παρουσία κρατήσεων",
  "Διαχειριστείτε την καθημερινή λειτουργία από το Talos",
] as const;

export function HowItWorksSection() {
  return (
    <section className="talos-section border-b border-[var(--talos-line)]">
      <div className="talos-container">
        <SectionHeader
          kicker="Πώς λειτουργεί"
          title="Μια σαφής διαδρομή από το κατάλυμα στη λειτουργία."
          lede="Για πελάτες λογισμικού, το Talos ακολουθεί μια πρακτική ακολουθία βημάτων, με βάση όσα η πλατφόρμα ήδη υποστηρίζει."
        />
        <ol className="mt-10 space-y-0 border-l border-[var(--talos-line)] ml-3">
          {STEPS.map((step, index) => (
            <li key={step} className="relative py-4 pl-8">
              <span className="absolute -left-[5px] top-6 h-2.5 w-2.5 rounded-full bg-[var(--talos-forest)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
                Βήμα {index + 1}
              </p>
              <p className="mt-1 text-lg font-medium text-[var(--talos-ink)]">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 border border-[var(--talos-line)] bg-[var(--talos-sand)]/40 p-6 md:p-8">
          <p className="talos-display text-2xl font-semibold tracking-tight">
            Δεν θέλετε να το διαχειρίζεστε μόνοι σας;
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--talos-muted)]">
            Το Talos μπορεί να διαχειριστεί το κατάλυμα για εσάς — ενώ εσείς διατηρείτε ορατότητα μέσω
            της πλατφόρμας όπου υποστηρίζεται.
          </p>
          <div className="mt-6">
            <MarketingButton href="/property-management" variant="secondary">
              Εξερευνήστε τη διαχείριση καταλυμάτων
            </MarketingButton>
          </div>
        </div>
      </div>
    </section>
  );
}
