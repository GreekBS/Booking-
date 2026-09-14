"use client";

import { BookingWidget } from "@hcp/widget-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { MOCK_PUBLISHABLE_KEY, mockUnit } from "@hcp/storefront-sdk";

export default function WidgetEmbedHostClient() {
  const searchParams = useSearchParams();

  const config = useMemo(() => {
    const mockParam = searchParams.get("mock");
    const mockMode = mockParam === null ? false : mockParam !== "false";
    const apiBase = searchParams.get("apiBase") ?? undefined;
    return {
      publishableKey: searchParams.get("key") ?? MOCK_PUBLISHABLE_KEY,
      unitId: searchParams.get("unit") ?? mockUnit.id,
      propertySlug: searchParams.get("property") ?? undefined,
      locale: searchParams.get("locale") ?? "en-US",
      currency: searchParams.get("currency") ?? "EUR",
      mockMode,
      baseUrl: mockMode ? undefined : (apiBase ?? (typeof window !== "undefined" ? window.location.origin : undefined)),
      themeJson: searchParams.get("theme"),
    };
  }, [searchParams]);

  const theme = useMemo(() => {
    if (!config.themeJson) return undefined;
    try {
      return JSON.parse(config.themeJson) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }, [config.themeJson]);

  return (
    <div className="min-h-screen bg-white p-4">
      <BookingWidget
        publishableKey={config.publishableKey}
        unitId={config.unitId || undefined}
        propertySlug={config.propertySlug}
        locale={config.locale}
        currency={config.currency}
        mockMode={config.mockMode}
        baseUrl={config.baseUrl}
        theme={theme}
        iframeMode
      />
    </div>
  );
}
