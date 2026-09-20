import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { MarketingHomePage } from "@/components/marketing/MarketingHomePage";
import {
  JsonLd,
  buildPageMetadata,
  organizationJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/marketing/seo";
import { TALOS_BRAND } from "@/lib/marketing/site";

export const metadata = buildPageMetadata({
  title: "One platform for hospitality operations and growth",
  description: TALOS_BRAND.tagline,
  path: "/",
});

/**
 * Authenticated visitors keep app entry behavior.
 * Unauthenticated visitors see the public marketing homepage.
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    if (session.user.platformRole === "super_admin") {
      redirect("/platform");
    }
    redirect("/dashboard");
  }

  return (
    <>
      <JsonLd data={[organizationJsonLd(), softwareApplicationJsonLd()]} />
      <MarketingHomePage />
    </>
  );
}
