import type { Metadata } from "next";
import Image from "next/image";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Πλήρης διαχείριση καταλυμάτων",
  description:
    "Αφήστε το Talos να διαχειριστεί τη βραχυχρόνια μίσθωσή σας με προμήθεια — συντονισμός αγγελιών, κρατήσεων, επικοινωνίας επισκεπτών και ορατότητα ιδιοκτήτη μέσω της πλατφόρμας.",
  path: "/property-management",
});

export default function PropertyManagementPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Πλήρης διαχείριση καταλυμάτων Talos",
          description:
            "Επαγγελματική διαχείριση βραχυχρόνιας μίσθωσης με ορατότητα ιδιοκτήτη μέσω της πλατφόρμας Talos.",
          path: "/property-management",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="talos-kicker">Υπηρεσία διαχείρισης</p>
            <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Προτιμάτε να αναθέσετε τις λειτουργίες σε εμάς;
            </h1>
            <p className="talos-lede mt-5">
              Το Talos είναι εταιρεία τεχνολογίας φιλοξενίας και συνεργάτης διαχείρισης. Οι
              ιδιοκτήτες μπορούν να επιλέξουν επαγγελματική διαχείριση βραχυχρόνιας μίσθωσης,
              διατηρώντας ορατότητα μέσω της πλατφόρμας όπου υποστηρίζεται.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MarketingButton href="/get-started?source=property_management">
                Μιλήστε μαζί μας για διαχείριση καταλυμάτων
              </MarketingButton>
              <MarketingButton href="/get-started?source=pms" variant="secondary">
                Ή διαχειριστείτε το μόνοι σας
              </MarketingButton>
            </div>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm border border-[var(--talos-line)]">
            <Image
              src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80"
              alt="Μοντέρνος χώρος καθιστικού βίλας με μεγάλα παράθυρα"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 40vw"
            />
          </div>
        </div>
      </section>
      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container">
          <h2 className="talos-display text-3xl font-semibold">
            Υπηρεσίες που συζητάμε με ιδιοκτήτες
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {[
              "Διαχείριση και παρουσίαση αγγελιών",
              "Συντονισμός κρατήσεων",
              "Επικοινωνία επισκεπτών",
              "Στρατηγική διανομής και απευθείας παρουσίας",
              "Συζητήσεις υποστήριξης τιμολόγησης και εσόδων",
              "Αναφορές ιδιοκτήτη και ορατότητα πλατφόρμας",
            ].map((item) => (
              <p
                key={item}
                className="border-t border-[var(--talos-line)] pt-4 text-sm text-[var(--talos-ink-soft)]"
              >
                {item}
              </p>
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-sm text-[var(--talos-muted)]">
            Μοντέλα προμήθειας, ώρες κάλυψης και επιτόπιες υπηρεσίες συμφωνούνται ανά συνεργασία.
            Αυτή η σελίδα δεν δημοσιεύει εγγυήσεις πληρότητας, εσόδων ή SLA απόκρισης.
          </p>
        </div>
      </section>
      <FinalCtaSection getStartedHref="/get-started?source=property_management" />
    </>
  );
}
