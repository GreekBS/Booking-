import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingFunnelProvider } from "@/components/marketing/MarketingFunnelProvider";
import "@/components/marketing/talos-marketing.css";

/**
 * Marketing chrome reuses root-layout Inter/Fraunces CSS variables
 * (--font-talos-sans / --font-talos-display on <html>) — no duplicate next/font loaders.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="talos-marketing font-sans">
      <MarketingFunnelProvider>
        <MarketingNav />
        <main id="main">{children}</main>
        <MarketingFooter />
      </MarketingFunnelProvider>
    </div>
  );
}
