import Link from "next/link";
import { PlatformPageHeader } from "@/components/platform/PlatformPageHeader";
import { TenantsList } from "@/features/tenants/TenantsList";

export default function PlatformTenantsPage() {
  return (
    <div className="space-y-5">
      <PlatformPageHeader
        title="Tenants"
        description="Manage hospitality tenants and open tenant context as Platform Admin."
        actions={
          <Link
            href="/platform/tenants/new"
            className="inline-flex items-center justify-center rounded-md bg-[var(--platform-accent)] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Create tenant
          </Link>
        }
      />
      <TenantsList />
    </div>
  );
}
