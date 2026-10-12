import Image from "next/image";
import { MarketingButton } from "../MarketingButton";
import { SectionHeader } from "../SectionHeader";
import { MARKETING_IMAGES } from "../ProductVisuals";

export function ManagedServiceSection() {
  const img = MARKETING_IMAGES.managedService;

  return (
    <section className="talos-section border-b border-[var(--talos-line)]">
      <div className="talos-container grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm border border-[var(--talos-line)] md:aspect-[5/4] lg:aspect-[4/5]">
          <Image
            src={img.src}
            alt={img.alt}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 40vw"
          />
        </div>
        <div>
          <SectionHeader
            kicker="Αφήστε το Talos να το διαχειριστεί"
            title="Προτιμάτε να αναθέσετε τις λειτουργίες σε εμάς;"
            lede="Η ίδια πλατφόρμα λειτουργίας Talos μπορεί να χρησιμοποιηθεί από εσάς — ή από την ομάδα μας για λογαριασμό σας. Τεχνολογία, λειτουργίες φιλοξενίας και ορατότητα ιδιοκτήτη παραμένουν συνδεδεμένες."
          />
          <ul className="mt-8 space-y-3 text-sm text-[var(--talos-ink-soft)]">
            {[
              "Διαχείριση και παρουσίαση αγγελιών",
              "Συντονισμός κρατήσεων",
              "Επικοινωνία επισκεπτών",
              "Στρατηγική διανομής και απευθείας παρουσίας",
              "Αναφορές ιδιοκτήτη και ορατότητα πλατφόρμας όπου υποστηρίζεται",
            ].map((item) => (
              <li key={item} className="flex gap-3 border-b border-[var(--talos-line)] pb-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--talos-copper)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-[var(--talos-muted)]">
            Οι όροι συνεργασίας συμφωνούνται με κάθε ιδιοκτήτη. Δεν δημοσιεύουμε γενικές εγγυήσεις
            πληρότητας ή εσόδων.
          </p>
          <div className="mt-8">
            <MarketingButton href="/get-started?source=property_management">
              Μιλήστε μαζί μας για διαχείριση καταλυμάτων
            </MarketingButton>
          </div>
        </div>
      </div>
    </section>
  );
}
