import Link from "next/link";
import { FOOTER_GROUPS, getContactEmail } from "@/lib/marketing/site";

export function MarketingFooter() {
  const email = getContactEmail();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--talos-line)] bg-[var(--talos-ink)] text-[var(--talos-paper)]">
      <div className="talos-container grid gap-10 py-14 md:grid-cols-[1.2fr_repeat(3,1fr)]">
        <div>
          <p className="talos-display text-3xl font-semibold">TALOS</p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
            Hospitality software and optional full property management — built for
            operators who want control, and owners who want a trusted partner.
          </p>
          {email ? (
            <a
              href={`mailto:${email}`}
              className="mt-5 inline-block text-sm text-white/85 underline-offset-4 hover:underline"
            >
              {email}
            </a>
          ) : null}
        </div>

        {FOOTER_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
              {group.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/80 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="talos-container flex flex-col gap-2 py-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Talos. All rights reserved.</p>
          <p>Hospitality technology · Direct presence · Managed service</p>
        </div>
      </div>
    </footer>
  );
}
