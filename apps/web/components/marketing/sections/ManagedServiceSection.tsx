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
            kicker="Let Talos manage it"
            title="Prefer to leave the operations to us?"
            lede="The same Talos operating platform can be used by you — or by our team on your behalf. Technology, hospitality operations, and owner visibility stay connected."
          />
          <ul className="mt-8 space-y-3 text-sm text-[var(--talos-ink-soft)]">
            {[
              "Listing management and presentation",
              "Reservation coordination",
              "Guest communication",
              "Distribution and direct-presence strategy",
              "Owner reporting and platform visibility where supported",
            ].map((item) => (
              <li key={item} className="flex gap-3 border-b border-[var(--talos-line)] pb-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--talos-copper)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-[var(--talos-muted)]">
            Engagement terms are agreed with each owner. We do not publish blanket occupancy or
            revenue guarantees.
          </p>
          <div className="mt-8">
            <MarketingButton href="/get-started?source=property_management">
              Talk to us about property management
            </MarketingButton>
          </div>
        </div>
      </div>
    </section>
  );
}
