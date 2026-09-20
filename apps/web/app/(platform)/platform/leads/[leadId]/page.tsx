import Link from "next/link";
import { LeadDetailPanel } from "@/features/leads/LeadDetailPanel";

export default async function PlatformLeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;

  return (
    <div className="space-y-4">
      <Link
        href="/platform/leads"
        className="inline-flex text-sm font-medium text-[var(--platform-muted)] hover:text-[var(--platform-ink)]"
      >
        ← Back to leads
      </Link>
      <LeadDetailPanel leadId={leadId} />
    </div>
  );
}
