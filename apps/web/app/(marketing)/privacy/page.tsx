import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/marketing/seo";
import { getContactEmail } from "@/lib/marketing/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "How Talos collects and uses information when you use our hospitality platform, contact us, or share business details.",
  path: "/privacy",
});

const LAST_UPDATED = "18 September 2026";

export default function PrivacyPage() {
  const email = getContactEmail();

  return (
    <section className="talos-section">
      <div className="talos-container max-w-3xl">
        <p className="talos-kicker">Legal</p>
        <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-[var(--talos-muted)]">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="talos-lede mt-6">
          This policy explains, at a product level, how Talos handles information when you visit
          our website, contact us, create an account, or share details about your hospitality
          business. It is not a substitute for formal legal advice.
        </p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-[var(--talos-ink-soft)]">
          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Information you provide
            </h2>
            <p className="mt-3">
              You may share information with Talos when you create or manage an account, submit a
              contact or onboarding request, configure properties, or communicate with our team.
              Depending on the interaction, this can include:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Contact details such as name, email address, and phone number</li>
              <li>Account credentials and profile information</li>
              <li>
                Hospitality and business details such as portfolio size, property location,
                operating channels, current tools, and interests in Talos products or services
              </li>
              <li>Messages and other content you choose to send us</li>
            </ul>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Service and technical information
            </h2>
            <p className="mt-3">
              When you use Talos websites or applications, we may process technical information
              needed to operate and secure the service. This can include IP address, browser or
              device characteristics, approximate request timing, and diagnostic logs associated
              with authentication, API access, and reliability.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Why we process information
            </h2>
            <p className="mt-3">We process information to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Provide and improve Talos software and related services</li>
              <li>Respond to inquiries and evaluate fit for software or managed-service paths</li>
              <li>Authenticate users, protect accounts, and maintain platform security</li>
              <li>Operate hospitality workflows you configure inside Talos</li>
              <li>Communicate about service updates, support, or follow-up you requested</li>
              <li>Meet applicable legal and operational obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Retention
            </h2>
            <p className="mt-3">
              We retain information for as long as reasonably needed for the purposes described
              above, including service delivery, security, dispute handling, and legal compliance.
              Retention periods can vary by data category and operational need. When information is
              no longer needed, we take steps to delete or de-identify it where appropriate.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Sharing
            </h2>
            <p className="mt-3">
              Talos may use trusted service providers that help us host, operate, secure, or
              support the platform. Those providers process information only as needed to perform
              services for Talos. We do not sell personal information. We may disclose information
              if required by law or to protect the rights, safety, and integrity of Talos, our
              users, or others.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Your choices
            </h2>
            <p className="mt-3">
              Depending on your location and applicable law, you may have rights to access,
              correct, delete, or restrict certain information, or to object to certain processing.
              You can also update account details where the product allows it, and you may contact
              us to exercise available rights or ask privacy-related questions.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Security
            </h2>
            <p className="mt-3">
              We apply technical and organizational measures designed to protect information against
              unauthorized access, alteration, or loss. No method of transmission or storage is
              completely secure, and we continually improve our controls as the platform evolves.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Updates
            </h2>
            <p className="mt-3">
              We may update this policy as Talos products, operations, or legal requirements change.
              When we do, we will revise the “Last updated” date on this page. Continued use of
              Talos after an update means you can review the revised policy here.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Contact
            </h2>
            <p className="mt-3">
              For privacy questions or requests, contact Talos
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
                " through the channels published on our Contact page"
              )}
              .
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
