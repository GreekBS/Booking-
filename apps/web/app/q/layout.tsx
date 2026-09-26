"use client";

import { TenantProvider } from "@/hooks/use-tenant";

/**
 * Chrome-free shell for scanned QR codes. Housekeepers land here on a phone,
 * so there is no sidebar or breadcrumb — only the tenant context the cleaning
 * API calls need.
 */
export default function QrLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <div className="min-h-screen bg-background font-sans">{children}</div>
    </TenantProvider>
  );
}
