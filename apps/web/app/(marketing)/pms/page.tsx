import type { Metadata } from "next";
import Link from "next/link";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { ProductShell } from "@/components/marketing/ProductVisuals";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Σύστημα διαχείρισης καταλυμάτων",
  description:
    "Το Talos PMS βοηθά επιχειρήσεις φιλοξενίας να διαχειρίζονται καταλύματα, μονάδες, διαθεσιμότητα, κρατήσεις, επισκέπτες και πρόσβαση ομάδας από έναν χώρο εργασίας.",
  path: "/pms",
});

export default function PmsPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Σύστημα διαχείρισης καταλυμάτων Talos",
          description:
            "Λογισμικό λειτουργιών φιλοξενίας για καταλύματα, διαθεσιμότητα, κρατήσεις και συνεργασία ομάδας.",
          path: "/pms",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="talos-kicker">PMS</p>
            <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Σύστημα διαχείρισης καταλυμάτων σχεδιασμένο για βραχυχρόνια μίσθωση.
            </h1>
            <p className="talos-lede mt-5">
              Οργανώστε τον κατάλογο, το ημερολόγιο διαμονών, τις κρατήσεις, τα αρχεία επισκεπτών και τα
              δικαιώματα της ομάδας σε ένα μέρος — και συνδέστε διανομή και απευθείας κρατήσεις όταν
              είστε έτοιμοι.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <MarketingButton href="/get-started?source=pms">Ξεκινήστε</MarketingButton>
              <MarketingButton href="/website-builder" variant="secondary">
                Παρουσία καταλύματος
              </MarketingButton>
            </div>
          </div>
          <ProductShell />
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container">
          <SectionHeader
            title="Τι διαχειρίζεστε στο Talos"
            lede="Ο χώρος διαχείρισης καλύπτει τις επιφάνειες που χρησιμοποιούν καθημερινά οι ομάδες φιλοξενίας."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [
                "Καταλύματα και μονάδες",
                "Δομή καταλόγου για βίλες, διαμερίσματα και διαμονές με πολλές μονάδες.",
              ],
              [
                "Διαθεσιμότητα",
                "Προβολές ημερολογίου, δεσμεύσεις και κανόνες διαμονής που κρατούν το απόθεμα συνεκτικό.",
              ],
              [
                "Κρατήσεις",
                "Ροές εργασίας κρατήσεων, συμπεριλαμβανομένης της χειροκίνητης κράτησης.",
              ],
              ["Τιμολόγηση", "Πλάνα τιμών και εργαλεία τιμολόγησης για τις μονάδες σας."],
              [
                "Επισκέπτες και μέλη",
                "Αρχεία επισκεπτών και πρόσβαση ομάδας με δικαιώματα βάσει ρόλου.",
              ],
              [
                "Πολιτικές και παροχές",
                "Κανονισμοί σπιτιού και κατάλογοι παροχών συνδεδεμένοι με το κατάλυμα.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="border-t border-[var(--talos-line)] pt-4">
                <h2 className="font-semibold text-[var(--talos-ink)]">{title}</h2>
                <p className="mt-2 text-sm text-[var(--talos-muted)]">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-sm text-[var(--talos-muted)]">
            Προτιμάτε να μην λειτουργείτε μόνοι σας;{" "}
            <Link href="/property-management" className="underline underline-offset-4">
              Εξερευνήστε την πλήρη διαχείριση καταλυμάτων
            </Link>
            .
          </p>
        </div>
      </section>
      <FinalCtaSection getStartedHref="/get-started?source=pms" />
    </>
  );
}
