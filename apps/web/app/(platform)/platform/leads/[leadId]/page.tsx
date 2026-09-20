import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { LeadDetailPanel } from "@/features/leads/LeadDetailPanel";
import { SignOutButton } from "@/features/auth/SignOutButton";

export default async function PlatformLeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await auth();
  const { leadId } = await params;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">Platform Admin</h1>
            <p className="text-sm text-gray-600">{session?.user?.email}</p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <nav className="mb-6 flex gap-4 text-sm">
          <Link href="/platform/tenants" className="text-gray-600 hover:text-gray-900">
            Tenants
          </Link>
          <Link href="/platform/leads" className="font-medium text-gray-900">
            Leads
          </Link>
        </nav>
        <div className="mb-4">
          <Link
            href="/platform/leads"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to leads
          </Link>
        </div>
        <LeadDetailPanel leadId={leadId} />
      </main>
    </div>
  );
}
