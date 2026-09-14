"use client";

import {
  createMockStorefrontClient,
  MOCK_PUBLISHABLE_KEY,
  mockProperty,
  mockUnit,
} from "@hcp/storefront-sdk";
import { useEffect, useState } from "react";

export default function StorefrontMockPreviewPage() {
  const [output, setOutput] = useState<string>("Loading mock storefront…");

  useEffect(() => {
    async function run() {
      const client = createMockStorefrontClient({
        publishableKey: MOCK_PUBLISHABLE_KEY,
        locale: "en-US",
      });

      const config = await client.getConfig();
      const property = await client.getProperty(mockProperty.slug);
      const availability = await client.checkAvailability(mockUnit.id, {
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 2,
      });
      const preview = await client.previewPrice(mockUnit.id, {
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 2,
      });
      const hold = await client.createHold({
        unitId: mockUnit.id,
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 2,
      });
      const quote = await client.createQuote({ holdId: hold.id });
      const booking = await client.createBooking({
        quoteId: quote.id,
        guest: { name: "Preview Guest", email: "guest@example.com" },
      });

      setOutput(
        JSON.stringify(
          {
            config: { currency: config.currency, locale: config.locale },
            property: { name: property.name, slug: property.slug },
            availability: { available: availability.available },
            preview: { total: preview.total, currency: preview.currency },
            hold: { id: hold.id, expiresAt: hold.expiresAt },
            quote: { id: quote.id, total: quote.snapshot.total },
            booking: {
              confirmationCode: booking.confirmationCode,
              status: booking.status,
            },
          },
          null,
          2,
        ),
      );
    }
    void run();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Storefront SDK mock</h1>
        <p className="mt-1 text-gray-600">
          Headless <code>MockStorefrontClient</code> — Hold → Quote → Booking for{" "}
          {mockProperty.name}
        </p>
      </div>
      <pre className="overflow-auto rounded-lg bg-gray-900 p-4 text-sm text-green-300">
        {output}
      </pre>
    </div>
  );
}
