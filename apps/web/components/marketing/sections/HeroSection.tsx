import { MarketingButton } from "../MarketingButton";
import { HeroVisualComposition } from "../ProductVisuals";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--talos-line)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(232,226,214,0.85),transparent_55%),linear-gradient(180deg,var(--talos-paper),#efebe3)]"
      />
      <div className="talos-container relative grid items-center gap-10 py-12 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-20">
        <div>
          <p className="talos-kicker">Πλατφόρμα φιλοξενίας</p>
          <h1 className="talos-display mt-4 max-w-xl text-balance text-[2.35rem] font-semibold tracking-tight text-[var(--talos-ink)] sm:text-5xl lg:text-[3.35rem] lg:leading-[1.08]">
            Διαχειριστείτε την επιχείρηση φιλοξενίας σας. Χτίστε τη δική σας επωνυμία.
          </h1>
          <p className="talos-lede mt-5">
            Διαχειριστείτε καταλύματα, κρατήσεις, διανομή και την απευθείας παρουσία κρατήσεων από το
            Talos — ή αφήστε την ομάδα μας να αναλάβει τη λειτουργία για εσάς.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <MarketingButton href="/get-started?source=homepage_hero">
              Ξεκινήστε
            </MarketingButton>
            <MarketingButton href="/property-management" variant="secondary">
              Αφήστε το Talos να διαχειριστεί το κατάλυμά μου
            </MarketingButton>
          </div>
          <p className="mt-5 text-sm text-[var(--talos-muted)]">
            Χρησιμοποιήστε το λογισμικό μόνοι σας. Αναπτύξτε απευθείας παρουσία. Ή αφήστε το Talos να
            λειτουργήσει για λογαριασμό σας.
          </p>
        </div>

        <HeroVisualComposition />
      </div>
    </section>
  );
}
