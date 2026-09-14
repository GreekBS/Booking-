"use client";

import { BookingWidget } from "@hcp/widget-react";
import { MOCK_PUBLISHABLE_KEY, mockUnit } from "@hcp/storefront-sdk";

/** Minimal host page for iframe embed preview (no chrome). */
export default function WidgetIframePreviewPage() {
  return (
    <div className="min-h-screen bg-white p-4">
      <BookingWidget
        publishableKey={MOCK_PUBLISHABLE_KEY}
        unitId={mockUnit.id}
        mockMode
        locale="en-US"
        iframeMode
      />
    </div>
  );
}
