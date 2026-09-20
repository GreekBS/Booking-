import Link from "next/link";
import { TenantsList } from "@/features/tenants/TenantsList";

export default function PlatformTenantsPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--platform-ink)]">
            Tenants
          </h2>
          <p className="mt-1 text-sm text-[var(--platform-muted)]">
            Manage hospitality tenants and open tenant context as Platform Admin.
          </p>
        </div>
        <Link
          href="/platform/tenants/new"
          className="inline-flex items-center justify-center rounded-md bg-[var(--platform-accent)] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Create tenant
        </Link>
      </div>
      <TenantsList />
    </div>
  );
}
