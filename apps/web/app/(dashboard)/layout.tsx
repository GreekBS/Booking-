import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireSession } from "@/lib/tenant-context";
import { shouldRedirectSuperAdminToPlatform } from "@/lib/dashboard-routing";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // DB-authoritative platformRole for UX routing only — not a privilege grant.
  // JWT activeTenantId is session selection state established by Open / switcher.
  const actor = await requireSession();
  if (
    shouldRedirectSuperAdminToPlatform({
      platformRole: actor.platformRole,
      activeTenantId: actor.activeTenantId,
    })
  ) {
    redirect("/platform/tenants");
  }

  return <AdminShell>{children}</AdminShell>;
}
