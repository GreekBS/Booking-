import { Fraunces, Manrope } from "next/font/google";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingFunnelProvider } from "@/components/marketing/MarketingFunnelProvider";
import "@/components/marketing/talos-marketing.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-talos-display",
  display: "swap",
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-talos-sans",
  display: "swap",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`talos-marketing ${display.variable} ${sans.variable}`}>
      <MarketingFunnelProvider>
        <MarketingNav />
        <main id="main">{children}</main>
        <MarketingFooter />
      </MarketingFunnelProvider>
    </div>
  );
}
