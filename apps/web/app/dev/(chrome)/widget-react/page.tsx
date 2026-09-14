"use client";

import { BookingWidget } from "@hcp/widget-react";
import {
  MOCK_PUBLISHABLE_KEY,
  mockProperty,
  mockUnit,
} from "@hcp/storefront-sdk";
import { useState } from "react";
import type { WidgetEvent } from "@hcp/storefront-sdk";

export default function WidgetReactPreviewPage() {
  const [events, setEvents] = useState<string[]>([]);

  function handleEvent(event: WidgetEvent) {
    setEvents((prev) => [JSON.stringify(event), ...prev].slice(0, 8));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">React booking widget</h1>
        <p className="mt-1 text-gray-600">
          {mockProperty.name} · unit {mockUnit.slug} · mockMode
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <BookingWidget
          publishableKey={MOCK_PUBLISHABLE_KEY}
          unitId={mockUnit.id}
          propertySlug={mockProperty.slug}
          mockMode
          locale="en-US"
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
          onEvent={handleEvent}
          className="max-w-md"
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
