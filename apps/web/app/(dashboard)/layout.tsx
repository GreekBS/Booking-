import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAuthSession, requireSession } from "@/lib/tenant-context";
import { shouldRedirectSuperAdminToPlatform } from "@/lib/dashboard-routing";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  // DB-authoritative platformRole for UX routing only — not a privilege grant.
  // Reuses request-scoped requireSession / getAuthSession (no duplicate User lookup).
  const actor = await requireSession();
  if (
    shouldRedirectSuperAdminToPlatform({
      platformRole: actor.platformRole,
      activeTenantId: actor.activeTenantId,
    })
  ) {
    redirect("/platform");
  }

  return <AdminShell>{children}</AdminShell>;
}
