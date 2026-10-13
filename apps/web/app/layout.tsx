import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { TALOS_BRAND } from "@/lib/marketing/site";

/**
 * Inter + Fraunces CSS variables must live on <html> so Radix portals
 * (Sheet/Dialog → document.body) resolve --font-talos-sans. Defining the
 * variable only on a dashboard descendant leaves portals on the UA serif default.
 */
const sans = Inter({
  subsets: ["latin", "latin-ext", "greek"],
  variable: "--font-talos-sans",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-talos-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${TALOS_BRAND.name} — Hospitality platform`,
    template: `%s · ${TALOS_BRAND.name}`,
  },
  description: TALOS_BRAND.tagline,
  applicationName: TALOS_BRAND.name,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
