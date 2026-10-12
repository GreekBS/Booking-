import type { Metadata } from "next";
import { GetStartedWizard } from "@/features/get-started/GetStartedWizard";
import {
  parseLeadSourceParam,
  parseOptionalUtm,
} from "@/lib/marketing/lead-source";
import { buildPageMetadata } from "@/lib/marketing/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Ξεκινήστε",
  description:
    "Πείτε στο Talos για την επιχείρηση φιλοξενίας σας, ώστε να κατανοήσουμε τη σωστή διαδρομή πλατφόρμας ή υπηρεσίας διαχείρισης.",
  path: "/get-started",
  noIndex: true,
});

type SearchParams = Record<string, string | string[] | undefined>;

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const source = parseLeadSourceParam(params.source);
  const utmSource = parseOptionalUtm(params.utm_source ?? params.utmSource);
  const utmMedium = parseOptionalUtm(params.utm_medium ?? params.utmMedium);
  const utmCampaign = parseOptionalUtm(
    params.utm_campaign ?? params.utmCampaign,
  );
  const preselectManaged = source === "property_management";

  return (
    <section className="relative overflow-hidden border-b border-[var(--talos-line)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(232,226,214,0.9),transparent_50%),linear-gradient(180deg,var(--talos-paper),#efebe3)]"
      />
      <div className="talos-container relative grid gap-10 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:py-16">
        <aside className="hidden lg:block">
          <p className="talos-kicker">Ξεκινήστε</p>
          <h1 className="talos-display mt-4 max-w-md text-balance text-4xl font-semibold tracking-tight lg:text-[2.75rem] lg:leading-[1.12]">
            Πείτε μας για την επιχείρηση φιλοξενίας σας.
          </h1>
          <p className="talos-lede mt-5">
            Αυτό δεν είναι εγγραφή λογαριασμού. Είναι μια σύντομη αξιολόγηση ώστε το Talos να
            κατανοήσει ποιοι είστε, τι διαχειρίζεστε και πώς μπορούμε να βοηθήσουμε — λογισμικό,
            ανάπτυξη ή υπηρεσία διαχείρισης.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-[var(--talos-ink-soft)]">
            {[
              "Δεν συλλέγονται κωδικοί ή διαπιστευτήρια καναλιών",
              "Δεν δημιουργείται λογαριασμός Χρήστη ή Οργανισμού από αυτή τη φόρμα",
              "Μπορείτε να δημιουργήσετε λογαριασμό ξεχωριστά όποτε είστε έτοιμοι",
            ].map((item) => (
              <li key={item} className="flex gap-2 border-b border-[var(--talos-line)] pb-3">
                <span aria-hidden className="text-[var(--talos-forest)]">
                  —
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div>
          <div className="mb-6 lg:hidden">
            <p className="talos-kicker">Ξεκινήστε</p>
            <h1 className="talos-display mt-3 text-3xl font-semibold tracking-tight">
              Πείτε μας για την επιχείρησή σας.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--talos-muted)]">
              Μόνο αξιολόγηση — όχι εγγραφή λογαριασμού. Δεν συλλέγονται διαπιστευτήρια.
            </p>
          </div>
          <GetStartedWizard
            source={source}
            utmSource={utmSource}
            utmMedium={utmMedium}
            utmCampaign={utmCampaign}
            preselectManaged={preselectManaged}
          />
        </div>
      </div>
    </section>
  );
}
