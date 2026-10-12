import type { Metadata } from "next";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { PresenceTransformation } from "@/components/marketing/ProductVisuals";
import { SectionHeader } from "@/components/marketing/SectionHeader";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { buildPageMetadata, JsonLd, serviceJsonLd } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Επωνυμική παρουσία καταλύματος",
  description:
    "Μετατρέψτε τα δεδομένα καταλύματος του Talos σε επωνυμική παρουσία προς επισκέπτες — φωτογραφίες, λεπτομέρειες και εμπειρίες έτοιμες για κράτηση, συνδεδεμένες με το ίδιο σύστημα αναφοράς.",
  path: "/website-builder",
});

export default function WebsiteBuilderPage() {
  return (
    <>
      <JsonLd
        data={serviceJsonLd({
          name: "Επωνυμική παρουσία καταλύματος Talos",
          description:
            "Παρουσία καταλύματος προς επισκέπτες, με βάση τα δεδομένα καταλύματος και τις δυνατότητες κράτησης του Talos.",
          path: "/website-builder",
        })}
      />
      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container max-w-3xl">
          <p className="talos-kicker">Παρουσία καταλύματος</p>
          <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Δημιουργήστε τη δική σας επωνυμική παρουσία καταλύματος.
          </h1>
          <p className="talos-lede mt-5">
            Οι επισκέπτες αξίζει να συναντούν το κατάλυμά σας σε μια παρουσία που αντανακλά την
            επωνυμία σας. Το Talos κρατά το περιεχόμενο και τη διαθεσιμότητα σε ένα μέρος — και σας
            βοηθά να τα παρουσιάσετε σε απευθείας επισκέπτες.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <MarketingButton href="/get-started?source=website_builder">
              Ξεκινήστε
            </MarketingButton>
            <MarketingButton href="/direct-bookings" variant="secondary">
              Διαδρομή απευθείας κράτησης
            </MarketingButton>
          </div>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)] bg-white">
        <div className="talos-container">
          <PresenceTransformation />
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              [
                "Περιεχόμενο καταλύματος",
                "Λεπτομέρειες και παρουσίαση παραμένουν συνδεδεμένες με το κατάλυμα που ήδη λειτουργείτε στο Talos.",
              ],
              [
                "Εμπειρία επωνυμίας",
                "Παρουσία προς τον επισκέπτη σχεδιασμένη γύρω από το κατάλυμα — σε υπολογιστή και κινητό.",
              ],
              [
                "Συνδεδεμένη με την κράτηση",
                "Διαθεσιμότητα και δυνατότητα κράτησης παραμένουν μέρος της ίδιας λειτουργικής βάσης.",
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="talos-section border-b border-[var(--talos-line)]">
        <div className="talos-container">
          <SectionHeader
            title="Τι υπάρχει σήμερα — και τι ακολουθεί"
            lede="Σήμερα το Talos παρέχει δυνατότητες βιτρίνας και ενσωματώσιμες εμπειρίες κράτησης που τροφοδοτούν μια παρουσία έτοιμη για κράτηση από τα δεδομένα του καταλύματός σας. Ένας πλήρης αυτοεξυπηρετούμενος CMS / δημιουργός φιλοξενούμενου marketing site με ένα κλικ βρίσκεται στον οδικό χάρτη — αυτή η σελίδα προβάλλει τη βάση που υπάρχει ήδη, όχι ένα ολοκληρωμένο στούντιο ιστοσελίδων."
          />
        </div>
      </section>
      <FinalCtaSection getStartedHref="/get-started?source=website_builder" />
    </>
  );
}
