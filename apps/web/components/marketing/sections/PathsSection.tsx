import { MarketingButton } from "../MarketingButton";
import { SectionHeader } from "../SectionHeader";

export function PathsSection() {
  return (
    <section id="paths" className="talos-section border-b border-[var(--talos-line)]">
      <div className="talos-container">
        <SectionHeader
          kicker="Το κατάλυμά σας. Η επιλογή σας."
          title="Δύο τρόποι συνεργασίας με το Talos"
          lede="Χρησιμοποιήστε την πλατφόρμα για να λειτουργείτε μόνοι σας — ή συνεργαστείτε με το Talos για επαγγελματική διαχείριση βραχυχρόνιας μίσθωσης, με ορατότητα όπου η πλατφόρμα το υποστηρίζει."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <article className="flex flex-col border border-[var(--talos-line)] bg-white p-8 md:p-10">
            <p className="talos-kicker">Λογισμικό</p>
            <h3 className="talos-display mt-3 text-3xl font-semibold tracking-tight">
              Διαχειριστείτε το μόνοι σας
            </h3>
            <p className="mt-4 text-[var(--talos-muted)] leading-relaxed">
              Διαχειριστείτε κρατήσεις, καταλύματα, διαθεσιμότητα, τιμές, αρχεία επισκεπτών και
              πρόσβαση ομάδας, και αναπτύξτε απευθείας παρουσία κρατήσεων από έναν ενιαίο χώρο
              εργασίας.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-[var(--talos-ink-soft)]">
              {[
                "Καταλύματα, μονάδες και πολιτικές",
                "Ημερολόγιο διαθεσιμότητας και κρατήσεις",
                "Απευθείας παρουσία κρατήσεων",
                "Μέλη ομάδας και λειτουργικά εργαλεία",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-[var(--talos-forest)]">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <MarketingButton href="/pms">Εξερευνήστε την πλατφόρμα</MarketingButton>
            </div>
          </article>

          <article className="flex flex-col border border-[var(--talos-line)] bg-[var(--talos-ink)] p-8 text-[var(--talos-paper)] md:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--talos-sand)_80%,white)]">
              Υπηρεσία διαχείρισης
            </p>
            <h3 className="talos-display mt-3 text-3xl font-semibold tracking-tight">
              Αφήστε το Talos να το διαχειριστεί
            </h3>
            <p className="mt-4 leading-relaxed text-white/70">
              Προτιμάτε να εστιάσετε στην ιδιοκτησία; Η ομάδα μας μπορεί να λειτουργήσει τη
              βραχυχρόνια μίσθωση στην ίδια πλατφόρμα Talos — συντονισμός αγγελιών, κρατήσεις,
              επικοινωνία επισκεπτών, στρατηγική διανομής και ορατότητα ιδιοκτήτη όπου υποστηρίζεται.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              {[
                "Συντονισμός αγγελιών και κρατήσεων",
                "Επικοινωνία επισκεπτών",
                "Στρατηγική διανομής και απευθείας παρουσίας",
                "Ορατότητα ιδιοκτήτη στο Talos",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-[var(--talos-sand)]">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <MarketingButton href="/property-management" variant="on-dark">
                Εξερευνήστε τη διαχείριση καταλυμάτων
              </MarketingButton>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
