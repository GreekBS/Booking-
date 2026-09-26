import { redirect } from "next/navigation";
import { Fraunces, Manrope } from "next/font/google";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAuthSession, requireSession } from "@/lib/tenant-context";
import { shouldRedirectSuperAdminToPlatform } from "@/lib/dashboard-routing";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-talos-sans",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-talos-display",
  display: "swap",
});

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

  return (
    <div className={`${sans.variable} ${display.variable} font-sans`}>
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
