import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/marketing/seo";
import { getContactEmail } from "@/lib/marketing/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "Terms for using Talos hospitality software, including messaging and AI-assisted guest support features.",
  path: "/terms",
});

const LAST_UPDATED = "29 September 2026";

export default function TermsPage() {
  const email = getContactEmail();

  return (
    <section className="talos-section">
      <div className="talos-container max-w-3xl">
        <p className="talos-kicker">Legal</p>
        <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-[var(--talos-muted)]">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="talos-lede mt-6">
          These terms describe the conditions under which you may access and use Talos. They are a
          product-level statement and are not a substitute for a negotiated commercial contract or
          formal legal advice.
        </p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-[var(--talos-ink-soft)]">
          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Scope of service
            </h2>
            <p className="mt-3">
              Talos provides software and related services for hospitality operators, including
              property and booking workflows, guest communications, and optional AI-assisted guest
              support features. Features available to you depend on your account, configuration, and
              any commercial arrangement with Talos.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Accounts and authorized use
            </h2>
            <p className="mt-3">
              You must provide accurate account information and keep credentials confidential. You
              are responsible for activity under your account and for ensuring that only authorized
              people access Talos on behalf of your organization. You may use Talos only for lawful
              hospitality and related business purposes.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Operator responsibilities
            </h2>
            <p className="mt-3">
              Accommodation operators remain responsible for their properties, guest relationships,
              bookings, house rules, local compliance obligations, and the instructions they give
              Talos. Operators are responsible for the accuracy of property information, guest
              knowledge, and automation settings they configure in the product.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Acceptable use
            </h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Misuse Talos to send spam, unlawful content, or deceptive communications</li>
              <li>Attempt to bypass security, authentication, or access controls</li>
              <li>Interfere with platform integrity, availability, or other customers’ use</li>
              <li>
                Use messaging or AI features in ways that violate applicable law, Meta/WhatsApp
                policies, or guest expectations for the channel
              </li>
              <li>Reverse engineer or scrape the service except where applicable law allows</li>
            </ul>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Messaging and WhatsApp
            </h2>
            <p className="mt-3">
              Where WhatsApp or other messaging features are enabled, you are responsible for having
              an appropriate basis to contact guests, for the content of communications you
              authorize, and for complying with messaging-provider rules. Talos processes message
              traffic as needed to deliver the configured service.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              AI-assisted assistance
            </h2>
            <p className="mt-3">
              Talos may offer AI-assisted drafts or replies based on property knowledge and product
              settings. AI output can be incomplete, outdated, or incorrect. Talos does not guarantee
              that AI responses are error-free. Operators remain responsible for property-specific
              policies, decisions, escalations, and for supervising or configuring AI behavior
              appropriately for their guests.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Service availability
            </h2>
            <p className="mt-3">
              We work to keep Talos available and reliable, but we do not promise uninterrupted or
              error-free operation. Maintenance, third-party outages, network issues, and unforeseen
              events can affect availability. Features may change as the product evolves.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Intellectual property
            </h2>
            <p className="mt-3">
              Talos software, branding, and related materials remain the property of Talos and its
              licensors. You retain rights to content and data you provide to the service, subject
              to the rights needed for Talos to operate the platform for you. You may not copy or
              redistribute Talos materials except as permitted by these terms or a separate written
              agreement.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Third-party services
            </h2>
            <p className="mt-3">
              Talos may integrate with third-party services such as Meta/WhatsApp, hosting
              providers, and AI providers. Those services are governed by their own terms and
              policies. Talos is not responsible for third-party outages, policy changes, or
              decisions outside Talos’s control.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Limitation of liability
            </h2>
            <p className="mt-3">
              To the fullest extent permitted by applicable law, Talos is not liable for indirect,
              incidental, special, consequential, or punitive damages, or for lost profits, revenue,
              data, or business opportunities arising from use of the service. Nothing in these
              terms excludes liability that cannot be excluded under applicable law.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Privacy
            </h2>
            <p className="mt-3">
              How Talos handles personal information is described in our{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-4 hover:text-[var(--talos-ink)]"
              >
                Privacy Policy
              </Link>
              . Requests related to deletion of personal data are described on our{" "}
              <Link
                href="/data-deletion"
                className="underline underline-offset-4 hover:text-[var(--talos-ink)]"
              >
                User data deletion
              </Link>{" "}
              page.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Changes to these terms
            </h2>
            <p className="mt-3">
              We may update these terms as the product or operational needs change. When we do, we
              will revise the “Last updated” date on this page. Continued use of Talos after an
              update means you can review the revised terms here.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Contact
            </h2>
            <p className="mt-3">
              Questions about these terms can be sent to Talos
              {email ? (
                <>
                  {" "}
                  at{" "}
                  <a
                    href={`mailto:${email}`}
                    className="underline underline-offset-4 hover:text-[var(--talos-ink)]"
                  >
                    {email}
                  </a>
                </>
              ) : (
                <>
                  {" "}
                  through the channels published on our{" "}
                  <Link
                    href="/contact"
                    className="underline underline-offset-4 hover:text-[var(--talos-ink)]"
                  >
                    Contact
                  </Link>{" "}
                  page
                </>
              )}
              .
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
