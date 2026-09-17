import type { Metadata } from "next";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { buildPageMetadata } from "@/lib/marketing/seo";
import { getContactEmail } from "@/lib/marketing/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact",
  description:
    "Contact Talos about hospitality software, direct bookings, or full property management.",
  path: "/contact",
});

export default function ContactPage() {
  const email = getContactEmail();

  return (
    <section className="talos-section">
      <div className="talos-container max-w-2xl">
        <p className="talos-kicker">Contact</p>
        <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Talk with Talos.
        </h1>
        <p className="talos-lede mt-5">
          Whether you want to operate the software yourself or explore managed property service,
          choose the path that fits — we will meet you there.
        </p>

        <div className="mt-10 space-y-8 border border-[var(--talos-line)] bg-white p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
              Software path
            </p>
            <p className="mt-2 text-sm text-[var(--talos-ink-soft)]">
              Create an account and start configuring your hospitality operation in Talos.
            </p>
            <div className="mt-4">
              <MarketingButton href="/register">Get started with Talos</MarketingButton>
            </div>
          </div>

          <div className="border-t border-[var(--talos-line)] pt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--talos-muted)]">
              Managed service path
            </p>
            {email ? (
              <>
                <p className="mt-2 text-sm text-[var(--talos-ink-soft)]">
                  Email the team about property management. We will follow up to discuss fit and
                  next steps.
                </p>
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent("Talos property management inquiry")}`}
                  className="mt-4 inline-flex items-center justify-center rounded-sm bg-[var(--talos-forest)] px-5 py-3 text-sm font-semibold tracking-wide text-[var(--talos-paper)] hover:bg-[var(--talos-forest-deep)]"
                >
                  Email {email}
                </a>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-[var(--talos-ink-soft)]">
                  A public inquiry address is not configured in this environment yet. Use the
                  software path to begin, or review how managed service works while contact is being
                  finalized for launch.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <MarketingButton href="/property-management" variant="secondary">
                    Review property management
                  </MarketingButton>
                  <MarketingButton href="/register">Get started meanwhile</MarketingButton>
                </div>
                <p className="mt-4 text-xs text-[var(--talos-muted)]">
                  Launch note: set{" "}
                  <code className="font-mono text-[11px]">NEXT_PUBLIC_TALOS_CONTACT_EMAIL</code> to
                  enable direct email conversion for managed-service inquiries.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
