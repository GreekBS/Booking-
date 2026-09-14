import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.platformRole === "super_admin") {
    redirect("/platform/tenants");
  }

  return <AdminShell>{children}</AdminShell>;
}
