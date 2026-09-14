"use client";

import { BookingWidget } from "@hcp/widget-react";
import {
  LIVE_PROPERTY_SLUG,
  LIVE_STOREFRONT_KEY,
  LIVE_UNIT_ID,
  livePreviewBaseUrl,
} from "@/lib/storefront/live-preview-config";
import { useState } from "react";
import type { WidgetEvent } from "@hcp/storefront-sdk";

export default function WidgetLivePreviewPage() {
  const [events, setEvents] = useState<string[]>([]);
  const baseUrl = livePreviewBaseUrl();

  function handleEvent(event: WidgetEvent) {
    setEvents((prev) => [JSON.stringify(event), ...prev].slice(0, 10));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">React booking widget (live API)</h1>
        <p className="mt-1 text-gray-600">
          Connected to Storefront API at {baseUrl}. Requires seeded publishable key and active
          property.
        </p>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-white p-6 shadow-sm">
        <BookingWidget
          publishableKey={LIVE_STOREFRONT_KEY}
          baseUrl={baseUrl}
          mockMode={false}
          unitId={LIVE_UNIT_ID || undefined}
          propertySlug={LIVE_PROPERTY_SLUG || undefined}
          locale="en-US"
          currency="EUR"
          onEvent={handleEvent}
          className="max-w-md"
          theme={{
            colors: {
              primary: "#1a5f4a",
              primaryForeground: "#ffffff",
              background: "#ffffff",
              foreground: "#111827",
              muted: "#f3f4f6",
              border: "#e5e7eb",
              success: "#059669",
              error: "#dc2626",
            },
          }}
        />
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Event log</h2>
        <pre className="max-h-48 overflow-auto rounded bg-gray-900 p-3 text-xs text-green-300">
          {events.length === 0 ? "Waiting for widget events…" : events.join("\n")}
        </pre>
      </section>
    </div>
  );
}
