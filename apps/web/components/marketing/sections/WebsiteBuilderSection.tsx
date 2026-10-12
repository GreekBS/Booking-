import { MarketingButton } from "../MarketingButton";
import { SectionHeader } from "../SectionHeader";
import { PresenceTransformation } from "../ProductVisuals";

export function WebsiteBuilderSection() {
  return (
    <section id="direct-presence" className="talos-section border-b border-[var(--talos-line)]">
      <div className="talos-container">
        <SectionHeader
          kicker="Απευθείας παρουσία"
          title="Το κατάλυμά σας. Η επωνυμία σας. Απευθείας επισκέπτες."
          lede="Οι πληροφορίες καταλύματος που ήδη διαχειρίζεστε στο Talos μπορούν να τροφοδοτήσουν μια παρουσία προς τον επισκέπτη — ώστε οι επισκέπτες να ανακαλύπτουν την επωνυμία σας και να κάνουν κράτηση μέσω καναλιών που ελέγχετε εσείς."
        />

        <div className="mt-12">
          <PresenceTransformation />
        </div>

        <div className="mt-10 grid gap-6 border-t border-[var(--talos-line)] pt-8 md:grid-cols-3">
          {[
            [
              "Ένα αρχείο καταλύματος",
              "Φωτογραφίες, λεπτομέρειες και διαθεσιμότητα παραμένουν έγκυρες στο Talos — και εμφανίζονται στους επισκέπτες.",
            ],
            [
              "Παρουσία έτοιμη για κράτηση",
              "Ενσωματωμένες εμπειρίες κράτησης και δυνατότητες βιτρίνας μετατρέπουν αυτά τα δεδομένα σε απευθείας διαδρομή προς κράτηση.",
            ],
            [
              "Επωνυμία που σας ανήκει",
              "Οι επισκέπτες συναντούν το κατάλυμά σας σε μια παρουσία που σας εκφράζει — όχι μόνο σε μια τρίτη αγγελία.",
            ],
          ].map(([title, body]) => (
            <div key={title}>
              <h3 className="text-base font-semibold text-[var(--talos-ink)]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-relaxed text-[var(--talos-muted)]">
            Το Talos δεν είναι σήμερα ένα CMS με ένα κλικ. Είναι η λειτουργική βάση για μια
            διαδικτυακή παρουσία έτοιμη για κρατήσεις — με βαθύτερα εργαλεία δημιουργίας ιστοτόπου
            στον οδικό χάρτη.
          </p>
          <MarketingButton href="/website-builder">
            Εξερευνήστε την παρουσία του καταλύματός σας
          </MarketingButton>
        </div>
      </div>
    </section>
  );
}
