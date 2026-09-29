import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/marketing/seo";
import { getContactEmail } from "@/lib/marketing/site";

export const metadata: Metadata = buildPageMetadata({
  title: "User data deletion",
  description:
    "How to request deletion of personal data associated with Talos and WhatsApp guest communications.",
  path: "/data-deletion",
});

const LAST_UPDATED = "29 September 2026";

export default function DataDeletionPage() {
  const email = getContactEmail();

  return (
    <section className="talos-section">
      <div className="talos-container max-w-3xl">
        <p className="talos-kicker">Legal</p>
        <h1 className="talos-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          User data deletion
        </h1>
        <p className="mt-4 text-sm text-[var(--talos-muted)]">
          Last updated: {LAST_UPDATED}
        </p>
        <p className="talos-lede mt-6">
          This page explains how to request deletion of personal data associated with Talos,
          including WhatsApp guest communications where those features are used. It supports Meta’s
          user data deletion URL requirement and related privacy requests.
        </p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-[var(--talos-ink-soft)]">
          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              How to request deletion
            </h2>
            <p className="mt-3">
              To request deletion of personal data associated with Talos or WhatsApp communications
              processed through Talos, send a written request
              {email ? (
                <>
                  {" "}
                  to{" "}
                  <a
                    href={`mailto:${email}?subject=${encodeURIComponent("Talos data deletion request")}`}
                    className="underline underline-offset-4 hover:text-[var(--talos-ink)]"
                  >
                    {email}
                  </a>
                </>
              ) : (
                <>
                  {" "}
                  through the contact channels listed on our{" "}
                  <Link
                    href="/contact"
                    className="underline underline-offset-4 hover:text-[var(--talos-ink)]"
                  >
                    Contact
                  </Link>{" "}
                  page
                </>
              )}
              . Please include enough information for us to identify the relevant records.
            </p>
            <p className="mt-3">Helpful details can include:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Your full name and an email address we can use to reply</li>
              <li>The WhatsApp phone number used in the conversation, if applicable</li>
              <li>The property or accommodation name, if known</li>
              <li>Approximate stay or conversation dates, if known</li>
              <li>Any booking reference you received, if available</li>
              <li>A clear statement that you are requesting deletion of your personal data</li>
            </ul>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              What happens after you request
            </h2>
            <p className="mt-3">
              After we receive a request, we review it and may ask for additional information to
              verify identity and locate the correct records. We then assess what personal data
              Talos holds in relation to the request and take deletion or de-identification steps
              where appropriate.
            </p>
            <p className="mt-3">
              Talos does not currently provide a fully automated self-service deletion portal for
              all data categories. Requests are handled through the contact process described on
              this page.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Verification and limits
            </h2>
            <p className="mt-3">
              We may need to verify that the requester is the individual concerned, or is authorized
              to act for that individual, before deleting data. Deletion may be limited where we
              must retain information for legitimate legal, accounting, security, dispute, or fraud
              prevention reasons, or where another lawful basis requires retention for a period of
              time.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Accommodation operators
            </h2>
            <p className="mt-3">
              Accommodation operators who use Talos may independently control booking, guest, and
              property records for their business. In some cases, a guest should also contact the
              property or operator that handled the stay, because the operator may remain
              responsible for certain records outside Talos’s ability to delete unilaterally.
            </p>
          </section>

          <section>
            <h2 className="talos-display text-2xl font-semibold text-[var(--talos-ink)]">
              Related policies
            </h2>
            <p className="mt-3">
              For broader information about how Talos processes personal data, see our{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-4 hover:text-[var(--talos-ink)]"
              >
                Privacy Policy
              </Link>
              . Product use conditions are described in our{" "}
              <Link
                href="/terms"
                className="underline underline-offset-4 hover:text-[var(--talos-ink)]"
              >
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
