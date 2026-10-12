import type { Metadata } from "next";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Απευθείας κρατήσεις",
  description:
    "Δεχτείτε κρατήσεις μέσω των δικών σας καναλιών με το Talos — έλεγχοι διαθεσιμότητας, προσφορές τιμής, προσωρινές δεσμεύσεις και κρατήσεις συνδεδεμένες με τον χώρο λειτουργιών σας.",
  path: "/direct-bookings",
});

export default function DirectBookingsPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Απευθείας κρατήσεις Talos",
          description:
            "Διαδρομές απευθείας κράτησης μέσω APIs βιτρίνας και ενσωματώσιμων widgets, ενσωματωμένες στις λειτουργίες του Talos.",
          path: "/direct-bookings",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container max-w-3xl">
          <p className="talos-kicker">Απευθείας κρατήσεις</p>
          <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Δεχτείτε κρατήσεις μέσω των δικών σας καναλιών.
          </h1>
          <p className="talos-lede mt-5">
            Η διανομή φέρνει ανακάλυψη. Οι απευθείας κρατήσεις κρατούν τη σχέση με τον επισκέπτη πιο
            κοντά στην επωνυμία σας. Το Talos υποστηρίζει ελέγχους διαθεσιμότητας, προσφορές τιμής,
            προσωρινές δεσμεύσεις και κρατήσεις μέσω APIs βιτρίνας και ενσωματώσιμων widgets — ενώ οι
            κρατήσεις παραμένουν στην ίδια λειτουργική εικόνα.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <MarketingButton href="/get-started?source=direct_bookings">
              Ξεκινήστε
            </MarketingButton>
            <MarketingButton href="/website-builder" variant="secondary">
              Επωνυμική παρουσία καταλύματος
            </MarketingButton>
          </div>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container">
          <h2 className="talos-display text-3xl font-semibold tracking-tight">
            Η διαδρομή απευθείας κράτησης
          </h2>
          <ol className="mt-8 space-y-0 border-l border-[var(--talos-line)] ml-3">
            {[
              [
                "Ανακάλυψη",
                "Ο επισκέπτης φτάνει στο κατάλυμά σας μέσω της δικής σας παρουσίας ή καναλιών.",
              ],
              [
                "Έλεγχος διαθεσιμότητας",
                "Ημερομηνίες και απόθεμα αξιολογούνται έναντι των λειτουργικών δεδομένων του Talos.",
              ],
              [
                "Προσφορά και δέσμευση",
                "Οι ροές βιτρίνας υποστηρίζουν προσφορές τιμής και προσωρινές δεσμεύσεις.",
              ],
              [
                "Κράτηση",
                "Η κράτηση καταχωρείται στο Talos — το ίδιο σύστημα που τρέχει την καθημερινή λειτουργία.",
              ],
            ].map(([title, body], index) => (
              <li key={title} className="relative py-4 pl-8">
                <span className="absolute -left-[5px] top-6 h-2.5 w-2.5 rounded-full bg-[var(--talos-forest)]" />
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
                  Βήμα {index + 1}
                </p>
                <p className="mt-1 text-lg font-medium text-[var(--talos-ink)]">{title}</p>
                <p className="mt-1 text-sm text-[var(--talos-muted)]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container grid gap-8 md:grid-cols-3">
          {[
            [
              "APIs βιτρίνας",
              "Endpoints καταλύματος, διαθεσιμότητας, προσφοράς, δέσμευσης και κράτησης για προϊόντα προς επισκέπτη.",
            ],
            [
              "Ενσωματώσιμα widgets",
              "Πακέτα React και ενσωμάτωσης, ώστε οι ροές κράτησης να ζουν σε sites και σελίδες που ελέγχετε εσείς.",
            ],
            [
              "Λειτουργική ενσωμάτωση",
              "Οι κρατήσεις απευθείας καναλιού παραμένουν ορατές δίπλα στον υπόλοιπο χώρο εργασίας Talos.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="border-t border-[var(--talos-line)] pt-4">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-[var(--talos-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>
      <FinalCtaSection getStartedHref="/get-started?source=direct_bookings" />
    </>
  );
}
