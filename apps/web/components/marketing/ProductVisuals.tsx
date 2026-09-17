import Image from "next/image";

/** Temporary hospitality photography — swap for owned assets later. */
export const MARKETING_IMAGES = {
  heroHospitality: {
    src: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80",
    alt: "Contemporary villa with pool at dusk",
    /** Recommended owned replacement: 4:5 portrait crop, ≥1600px wide */
    aspectHint: "4 / 5",
  },
  managedService: {
    src: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80",
    alt: "Modern villa living space with large windows",
    /** Recommended owned replacement: 5:4 landscape, ≥1600px wide */
    aspectHint: "5 / 4",
  },
  presenceHero: {
    src: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80",
    alt: "Sunlit villa exterior overlooking water",
    /** Recommended owned replacement: 16:10 landscape for guest-facing preview */
    aspectHint: "16 / 10",
  },
} as const;

const SIDE_NAV = [
  "Dashboard",
  "Properties",
  "Units",
  "Availability",
  "Bookings",
] as const;

/** Compact ops chrome for the hero — property + reservation signal. */
export function HeroOpsPanel() {
  return (
    <figure className="overflow-hidden rounded-sm border border-[var(--talos-line)] bg-white shadow-[0_20px_50px_-28px_rgba(18,22,20,0.4)]">
      <div className="flex items-center gap-2 border-b border-[var(--talos-line)] bg-[var(--talos-sand)]/45 px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--talos-mist)]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--talos-mist)]" />
        <span className="text-[10px] font-medium tracking-wide text-[var(--talos-muted)]">
          Talos · operations
        </span>
      </div>
      <div className="grid grid-cols-[5.5rem_1fr]">
        <aside className="border-r border-[var(--talos-line)] bg-[#f8f7f4] p-2.5">
          <p className="talos-display px-1 text-sm font-semibold">Talos</p>
          <ul className="mt-3 space-y-1">
            {SIDE_NAV.map((label, i) => (
              <li
                key={label}
                className={
                  i === 1
                    ? "rounded-sm bg-[var(--talos-forest)]/10 px-1.5 py-1 text-[10px] font-semibold text-[var(--talos-forest)]"
                    : "px-1.5 py-1 text-[10px] text-[var(--talos-muted)]"
                }
              >
                {label}
              </li>
            ))}
          </ul>
        </aside>
        <div className="p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--talos-muted)]">
            Property
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--talos-ink)]">Coastal villa</p>
          <div className="mt-3 space-y-1.5">
            <div className="border border-[var(--talos-line)] bg-[var(--talos-paper)] px-2.5 py-2">
              <p className="text-[11px] font-medium">Availability</p>
              <p className="text-[10px] text-[var(--talos-muted)]">Calendar · blocks · stays</p>
            </div>
            <div className="border border-[var(--talos-line)] bg-[var(--talos-paper)] px-2.5 py-2">
              <p className="text-[11px] font-medium">Reservation</p>
              <p className="text-[10px] text-[var(--talos-muted)]">Confirmed · guest stay</p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">Talos operations panel</figcaption>
    </figure>
  );
}

/** Guest-facing presence card for hero layering. */
export function HeroPresenceCard() {
  const img = MARKETING_IMAGES.presenceHero;
  return (
    <figure className="overflow-hidden rounded-sm border border-[var(--talos-line)] bg-white shadow-[0_16px_40px_-24px_rgba(18,22,20,0.45)]">
      <div className="border-b border-[var(--talos-line)] px-3 py-1.5 text-[10px] text-[var(--talos-muted)]">
        Your property presence
      </div>
      <div className="relative aspect-[16/10]">
        <Image
          src={img.src}
          alt={img.alt}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 70vw, 280px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
          <p className="talos-display text-lg font-semibold leading-tight">Coastal villa</p>
          <p className="mt-1 text-[10px] text-white/80">Check availability · Book directly</p>
        </div>
      </div>
      <figcaption className="sr-only">Guest-facing property presence preview</figcaption>
    </figure>
  );
}

/**
 * Desktop: hospitality plane + ops + presence.
 * Mobile: hospitality band + compact ops/presence row.
 */
export function HeroVisualComposition() {
  const hospitality = MARKETING_IMAGES.heroHospitality;

  return (
    <div className="relative">
      {/* Mobile hospitality plane */}
      <div className="relative mb-4 aspect-[5/3] overflow-hidden rounded-sm border border-[var(--talos-line)] lg:hidden">
        <Image
          src={hospitality.src}
          alt={hospitality.alt}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
      </div>

      {/* Desktop hospitality plane */}
      <div className="relative hidden min-h-[440px] overflow-hidden rounded-sm border border-[var(--talos-line)] lg:block">
        <Image
          src={hospitality.src}
          alt={hospitality.alt}
          fill
          priority
          className="object-cover"
          sizes="55vw"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-[color-mix(in_srgb,var(--talos-paper)_35%,transparent)]"
        />
        <div className="absolute bottom-6 right-5 z-10 w-[min(100%,300px)]">
          <HeroOpsPanel />
        </div>
        <div className="absolute right-8 top-6 z-20 w-[min(100%,230px)]">
          <HeroPresenceCard />
        </div>
      </div>

      {/* Mobile product + presence */}
      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <HeroOpsPanel />
        <HeroPresenceCard />
      </div>
    </div>
  );
}

/** Platform section — operational depth (calendar/bookings), not the hero catalog. */
export function OperationsDepthPanel() {
  return (
    <figure className="overflow-hidden rounded-sm border border-[var(--talos-line)] bg-white shadow-[0_24px_60px_-28px_rgba(18,22,20,0.35)]">
      <div className="flex items-center justify-between border-b border-[var(--talos-line)] bg-[var(--talos-sand)]/40 px-4 py-2.5">
        <p className="text-xs font-semibold tracking-wide text-[var(--talos-ink)]">
          Availability · Coastal villa
        </p>
        <span className="text-[10px] text-[var(--talos-muted)]">Operational view</span>
      </div>
      <div className="p-4 md:p-5">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--talos-muted)]">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={`${d}-${i}`}>{d}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {Array.from({ length: 28 }, (_, i) => {
            const booked = i === 9 || i === 10 || i === 11 || i === 18 || i === 19;
            const blocked = i === 4;
            return (
              <div
                key={i}
                className={
                  booked
                    ? "aspect-square rounded-sm bg-[var(--talos-forest)]/85"
                    : blocked
                      ? "aspect-square rounded-sm bg-[var(--talos-sand)]"
                      : "aspect-square rounded-sm border border-[var(--talos-line)] bg-[var(--talos-paper)]"
                }
              />
            );
          })}
        </div>
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between border border-[var(--talos-line)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Stay · Fri–Mon</p>
              <p className="text-xs text-[var(--talos-muted)]">Confirmed reservation</p>
            </div>
            <span className="text-[11px] font-medium text-[var(--talos-forest)]">Booked</span>
          </div>
          <div className="flex items-center justify-between border border-[var(--talos-line)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Owner block</p>
              <p className="text-xs text-[var(--talos-muted)]">Calendar hold</p>
            </div>
            <span className="text-[11px] font-medium text-[var(--talos-muted)]">Blocked</span>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Illustrative Talos availability calendar and reservation list
      </figcaption>
    </figure>
  );
}

/** Signature Direct Presence transformation: Talos property → guest presence. */
export function PresenceTransformation() {
  const presence = MARKETING_IMAGES.presenceHero;

  return (
    <div className="grid items-center gap-6 lg:grid-cols-[0.95fr_auto_1.15fr] lg:gap-4">
      <figure className="overflow-hidden rounded-sm border border-[var(--talos-line)] bg-white">
        <div className="border-b border-[var(--talos-line)] bg-[var(--talos-sand)]/40 px-3 py-2 text-[11px] text-[var(--talos-muted)]">
          In Talos
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--talos-muted)]">
            Property
          </p>
          <p className="mt-1 text-lg font-semibold">Coastal villa</p>
          <ul className="mt-4 space-y-2 text-sm text-[var(--talos-ink-soft)]">
            <li className="flex justify-between border-b border-[var(--talos-line)] pb-2">
              <span>Photos &amp; details</span>
              <span className="text-[var(--talos-forest)]">Ready</span>
            </li>
            <li className="flex justify-between border-b border-[var(--talos-line)] pb-2">
              <span>Availability</span>
              <span className="text-[var(--talos-forest)]">Live</span>
            </li>
            <li className="flex justify-between">
              <span>Booking capability</span>
              <span className="text-[var(--talos-forest)]">Connected</span>
            </li>
          </ul>
        </div>
        <figcaption className="sr-only">Property record inside Talos</figcaption>
      </figure>

      <div className="flex flex-row items-center justify-center gap-2 lg:flex-col" aria-hidden>
        <span className="hidden h-px w-8 bg-[var(--talos-line)] lg:block lg:h-10 lg:w-px" />
        <span className="talos-kicker text-[var(--talos-copper)]">Your presence</span>
        <span className="hidden h-px w-8 bg-[var(--talos-line)] lg:block lg:h-10 lg:w-px" />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1.2fr_0.75fr]">
        <figure className="overflow-hidden rounded-sm border border-[var(--talos-line)] bg-white shadow-[0_20px_50px_-30px_rgba(18,22,20,0.4)]">
          <div className="border-b border-[var(--talos-line)] px-3 py-2 text-[11px] text-[var(--talos-muted)]">
            Guest-facing presence · desktop
          </div>
          <div className="relative aspect-[16/10]">
            <Image
              src={presence.src}
              alt={presence.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 40vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
            <div className="absolute bottom-0 p-4 text-white">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/70">Stay</p>
              <p className="talos-display mt-1 text-2xl font-semibold leading-tight">
                Coastal villa
              </p>
              <span className="mt-3 inline-flex rounded-sm bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--talos-ink)]">
                Check availability
              </span>
            </div>
          </div>
          <figcaption className="sr-only">Desktop guest-facing property presence</figcaption>
        </figure>

        <figure className="mx-auto w-full max-w-[200px] overflow-hidden rounded-[1.15rem] border border-[var(--talos-line)] bg-white shadow-[0_20px_50px_-30px_rgba(18,22,20,0.4)] sm:mx-0 sm:max-w-none">
          <div className="border-b border-[var(--talos-line)] px-3 py-1.5 text-center text-[10px] text-[var(--talos-muted)]">
            Mobile
          </div>
          <div className="relative aspect-[9/14]">
            <Image
              src={presence.src}
              alt=""
              fill
              className="object-cover"
              sizes="200px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
            <div className="absolute bottom-0 w-full p-3 text-white">
              <p className="talos-display text-lg font-semibold">Book your stay</p>
              <div className="mt-3 rounded-sm bg-white py-2 text-center text-[11px] font-semibold text-[var(--talos-ink)]">
                Continue
              </div>
            </div>
          </div>
          <figcaption className="sr-only">Mobile guest booking presence</figcaption>
        </figure>
      </div>
    </div>
  );
}

/** Used on /pms supporting page — catalog chrome distinct from homepage hero. */
export function ProductShell({
  caption = "Talos operations workspace",
}: {
  caption?: string;
}) {
  return (
    <figure className="overflow-hidden rounded-sm border border-[var(--talos-line)] bg-white shadow-[0_24px_60px_-28px_rgba(18,22,20,0.35)]">
      <div className="flex items-center gap-2 border-b border-[var(--talos-line)] bg-[var(--talos-sand)]/50 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-[var(--talos-mist)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--talos-mist)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--talos-mist)]" />
        <span className="ml-2 text-[11px] font-medium tracking-wide text-[var(--talos-muted)]">
          app.talos · operations
        </span>
      </div>
      <div className="grid min-h-[280px] grid-cols-[minmax(7.5rem,28%)_1fr] md:min-h-[340px]">
        <aside className="border-r border-[var(--talos-line)] bg-[#f8f7f4] p-3">
          <p className="talos-display px-2 text-lg font-semibold tracking-tight">Talos</p>
          <ul className="mt-4 space-y-1">
            {["Dashboard", "Properties", "Units", "Availability", "Pricing", "Bookings"].map(
              (label, i) => (
                <li
                  key={label}
                  className={
                    i === 1
                      ? "rounded-sm bg-[var(--talos-forest)]/10 px-2 py-1.5 text-xs font-semibold text-[var(--talos-forest)]"
                      : "px-2 py-1.5 text-xs text-[var(--talos-muted)]"
                  }
                >
                  {label}
                </li>
              ),
            )}
          </ul>
        </aside>
        <div className="p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--talos-muted)]">
            Properties
          </p>
          <p className="mt-1 text-lg font-semibold text-[var(--talos-ink)]">Catalog</p>
          <div className="mt-5 space-y-2">
            {["Coastal villa", "Townhouse suite", "Garden apartment"].map((name, i) => (
              <div
                key={name}
                className="flex items-center justify-between border border-[var(--talos-line)] bg-[var(--talos-paper)] px-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--talos-ink)]">{name}</p>
                  <p className="text-xs text-[var(--talos-muted)]">Units · Availability · Pricing</p>
                </div>
                <span className="text-[11px] font-medium text-[var(--talos-forest)]">
                  {i === 0 ? "Selected" : "Open"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}
