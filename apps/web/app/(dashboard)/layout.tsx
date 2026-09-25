import { redirect } from "next/navigation";
import { Fraunces, Manrope } from "next/font/google";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAuthSession, requireSession } from "@/lib/tenant-context";
import { shouldRedirectSuperAdminToPlatform } from "@/lib/dashboard-routing";
import { perfLog, perfNow } from "@/lib/perf-diag";

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
  const layoutStart = perfNow();

  const authStart = perfNow();
  const session = await getAuthSession();
  perfLog("dashboard.layout.auth", perfNow() - authStart);

  if (!session?.user) {
    perfLog("dashboard.layout.total", perfNow() - layoutStart, {
      outcome: "redirect_login",
    });
    redirect("/login");
  }

  // DB-authoritative platformRole for UX routing only — not a privilege grant.
  // Reuses request-scoped requireSession / getAuthSession (no duplicate User lookup).
  const sessionStart = perfNow();
  const actor = await requireSession();
  perfLog("dashboard.layout.requireSession", perfNow() - sessionStart);

  if (
    shouldRedirectSuperAdminToPlatform({
      platformRole: actor.platformRole,
      activeTenantId: actor.activeTenantId,
    })
  ) {
    perfLog("dashboard.layout.total", perfNow() - layoutStart, {
      outcome: "redirect_platform",
    });
    redirect("/platform");
  }

  perfLog("dashboard.layout.total", perfNow() - layoutStart, { outcome: "ok" });

  return (
    <div className={`${sans.variable} ${display.variable} font-sans`}>
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
