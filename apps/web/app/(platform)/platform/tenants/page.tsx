import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { TenantsList } from "@/features/tenants/TenantsList";
import { SignOutButton } from "@/features/auth/SignOutButton";

export default async function PlatformTenantsPage() {
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
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium">Tenants</h2>
          <Link
            href="/platform/tenants/new"
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            Create tenant
          </Link>
        </div>
        <TenantsList />
      </main>
    </div>
  );
}
