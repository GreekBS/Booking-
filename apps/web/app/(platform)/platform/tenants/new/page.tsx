import { CreateTenantForm } from "@/features/tenants/CreateTenantForm";
import Link from "next/link";

export default function NewTenantPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-4">
          <Link href="/platform/tenants" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to tenants
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">Create tenant</h1>
        <CreateTenantForm />
      </main>
    </div>
  );
}
