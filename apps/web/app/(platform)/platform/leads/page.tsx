import { Suspense } from "react";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { LeadsList } from "@/features/leads/LeadsList";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PlatformLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : null;
  const source = typeof params.source === "string" ? params.source : null;
  const demoRaw = typeof params.demo === "string" ? params.demo : null;
  const demoRequested =
    demoRaw === "1" || demoRaw === "true"
      ? true
      : demoRaw === "0" || demoRaw === "false"
        ? false
        : null;

  return (
    <div className="space-y-5">
      <PlatformPageHeader
        title="Leads"
        description="Marketing inquiries from Get Started. New and demo-requested leads are highlighted."
      />
      <Suspense
        fallback={
          <p className="text-sm text-[var(--platform-muted)]">Loading...</p>
        }
      >
        <LeadsList
          initialStatus={status}
          initialSource={source}
          initialDemoRequested={demoRequested}
        />
      </Suspense>
    </div>
  );
}
