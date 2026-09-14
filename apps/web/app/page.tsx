import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.platformRole === "super_admin") {
    redirect("/platform/tenants");
  }
  redirect("/dashboard");
}
