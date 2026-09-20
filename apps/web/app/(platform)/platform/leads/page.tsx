import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { LeadsList } from "@/features/leads/LeadsList";
import { SignOutButton } from "@/features/auth/SignOutButton";

export default async function PlatformLeadsPage() {
  const session = await auth();

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
        <div className="mb-6">
          <h2 className="text-lg font-medium">Leads</h2>
          <p className="mt-1 text-sm text-gray-600">
            Marketing inquiries from Get Started. New and demo-requested leads are highlighted.
          </p>
        </div>
        <LeadsList />
      </main>
    </div>
  );
}
