import Link from "next/link";
import { CreateTenantForm } from "@/features/tenants/CreateTenantForm";

export default function NewTenantPage() {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <Link
          href="/platform/tenants"
          className="text-sm font-medium text-[var(--platform-muted)] hover:text-[var(--platform-ink)]"
        >
          ← Back to tenants
        </Link>
        <h2 className="mt-3 text-lg font-semibold text-[var(--platform-ink)]">
          Create tenant
        </h2>
      </div>
      <CreateTenantForm />
    </div>
  );
}
