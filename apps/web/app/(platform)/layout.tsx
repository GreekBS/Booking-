import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@hcp/domain";
import { requireSuperAdmin } from "@/lib/tenant-context";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { resolvePlatformEnvironment } from "@/components/platform/nav";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw error;
  }

  return (
    <PlatformShell environment={resolvePlatformEnvironment()}>
      {children}
    </PlatformShell>
  );
}
