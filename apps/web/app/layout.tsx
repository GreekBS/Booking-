import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TALOS_BRAND } from "@/lib/marketing/site";

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
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
