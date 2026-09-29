import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/marketing/seo";
import { getContactEmail } from "@/lib/marketing/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "How Talos processes information for hospitality operations, guest communications, WhatsApp messaging, and AI-assisted support.",
  path: "/privacy",
});

const LAST_UPDATED = "29 September 2026";

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
          our website, contact us, create an account, operate hospitality workflows, or use
          guest-messaging features such as WhatsApp and AI-assisted replies. It is not a substitute
          for formal legal advice.
        </p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-[var(--talos-ink-soft)]">
          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              What Talos is
            </h2>
            <p className="mt-3">
              Talos is a hospitality platform used by accommodation operators and related teams to
              manage properties, bookings, guest communications, and day-to-day operations. In many
              cases, Talos processes guest and booking information on behalf of the accommodation
              operator that uses the platform for their properties.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Categories of information
            </h2>
            <p className="mt-3">
              Depending on how Talos is used, we may process information in categories such as:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                Account and operator contact details (for example name, email address, and phone
                number)
              </li>
              <li>Account credentials and profile information</li>
              <li>
                Hospitality and business details such as portfolio size, property information,
                operating channels, and configuration of Talos features
              </li>
              <li>
                Guest and contact information associated with stays (for example guest name, email,
                and phone number)
              </li>
              <li>Booking and stay information (for example dates, property, and stay status)</li>
              <li>
                WhatsApp-related identifiers and message content when messaging features are enabled
                (for example WhatsApp user identifiers and inbound/outbound messages needed to
                operate conversations)
              </li>
              <li>Communication history and related operational notes created in Talos</li>
              <li>
                Operational accommodation data relevant to guest support (for example property
                knowledge used to answer guest questions)
              </li>
              <li>
                Technical and security information such as IP address, device/browser
                characteristics, request timing, and diagnostic logs
              </li>
              <li>Messages and other content you choose to send us through contact or support channels</li>
            </ul>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Why we process information
            </h2>
            <p className="mt-3">We process information to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Provide and improve Talos software and related services</li>
              <li>Operate booking, property, and hospitality workflows configured by operators</li>
              <li>Enable guest communication and support, including WhatsApp messaging where enabled</li>
              <li>
                Provide AI-assisted draft or automatic replies grounded in operator-configured
                property information, subject to product settings and safeguards
              </li>
              <li>Authenticate users, protect accounts, and maintain platform security</li>
              <li>Respond to inquiries and support requests</li>
              <li>Communicate about service updates, support, or follow-up you requested</li>
              <li>Meet applicable legal and operational obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Operators and guest data
            </h2>
            <p className="mt-3">
              When an accommodation operator uses Talos to manage guest stays and communications,
              Talos may process guest personal data as part of providing that service to the
              operator. Operators remain responsible for how they collect guest information, what
              they instruct Talos to do with it, and how they communicate with guests through
              channels they enable.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Service providers and processors
            </h2>
            <p className="mt-3">
              Talos may use trusted service providers that help host, operate, secure, communicate,
              or support the platform. Those providers process information only as needed to perform
              services for Talos. Depending on enabled features, this can include:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Meta / WhatsApp Business Platform for WhatsApp delivery and related messaging</li>
              <li>Hosting and infrastructure providers used to run the Talos application</li>
              <li>
                AI providers used to generate or assist with guest-facing responses when AI features
                are enabled
              </li>
            </ul>
            <p className="mt-3">
              We do not sell personal information. We may disclose information if required by law or
              to protect the rights, safety, and integrity of Talos, our users, or others.
            </p>
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
              International transfers
            </h2>
            <p className="mt-3">
              Talos and its service providers may process information in countries other than the
              country where you or the guest are located. Where international transfers occur, we
              take steps intended to protect the information in line with applicable requirements
              and the nature of the processing.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Rights for EU/EEA individuals
            </h2>
            <p className="mt-3">
              Where the GDPR or similar laws apply, individuals may have rights to request access,
              correction, deletion, restriction, objection, and portability of personal data, and to
              lodge a complaint with a supervisory authority. Availability of a given right depends
              on the circumstances and applicable law. You may also update certain account details
              where the product allows it.
            </p>
            <p className="mt-3">
              Guests who interacted with an accommodation through Talos/WhatsApp may contact us
              using the details below, or may also contact the accommodation operator that managed
              their stay.
            </p>
            <p className="mt-3">
              For deletion-specific instructions related to Meta requirements, see our{" "}
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
