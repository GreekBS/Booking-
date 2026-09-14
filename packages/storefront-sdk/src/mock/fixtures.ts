import { STOREFRONT_API_VERSION } from "../types/index.js";
import { defaultTheme } from "../types/theme.js";
import type {
  AvailabilityResult,
  PublicProperty,
  PublicUnit,
  PublicUnitSummary,
} from "../types/index.js";

export const MOCK_PUBLISHABLE_KEY = "pk_test_mock00000000000001";

export const mockProperty: PublicProperty = {
  id: "prop-villa-1",
  slug: "aegean-villa",
  name: "Aegean Villa",
  type: "villa",
  timezone: "Europe/Athens",
  location: { city: "Paros", country: "GR" },
  contentRefId: null,
  units: [
    {
      id: "unit-villa-entire",
      slug: "entire-property",
      name: "Entire Property",
      maxGuests: 6,
      bedrooms: 3,
      bathrooms: 2,
      status: "published",
    },
  ],
};

export const mockUnit: PublicUnit = {
  ...mockProperty.units[0]!,
  propertyId: mockProperty.id,
  propertySlug: mockProperty.slug,
};

export function mockAvailabilityAvailable(
  checkIn: string,
  checkOut: string,
): AvailabilityResult {
  const nights: AvailabilityResult["nights"] = [];
  let current = checkIn;
  while (current < checkOut) {
    nights.push({ date: current, available: true });
    const d = new Date(`${current}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    current = d.toISOString().slice(0, 10);
  }
  return {
    available: true,
    reasons: [],
    nights,
    minNights: 2,
    maxNights: 14,
  };
}

export function mockPricePreview(
  checkIn: string,
  checkOut: string,
  nightlyRate = "150.0000",
): {
  currency: string;
  lineItems: { date: string; amount: string; currency: string }[];
  subtotal: string;
  total: string;
  checkIn: string;
  checkOut: string;
} {
  const availability = mockAvailabilityAvailable(checkIn, checkOut);
  const lineItems = availability.nights.map((n) => ({
    date: n.date,
    amount: nightlyRate,
    currency: "EUR",
  }));
  const subtotal = (lineItems.length * 150).toFixed(4);
  return {
    currency: "EUR",
    lineItems,
    subtotal,
    total: subtotal,
    checkIn,
    checkOut,
  };
}

export const mockStorefrontConfig = {
  apiVersion: STOREFRONT_API_VERSION,
  locale: "en-US",
  locales: ["en-US", "el-GR"],
  currency: "EUR",
  confirmationMode: "manual" as const,
  features: { multiUnitCart: false, payments: false },
  theme: defaultTheme,
};

export const mockWidgetConfig = {
  apiVersion: STOREFRONT_API_VERSION,
  embedModes: ["inline", "modal", "iframe"] as const,
  iframeUrlTemplate: "https://book.hcp.example/w/{widgetToken}?unit={unitId}&locale={locale}",
  widgetVersion: "0.0.1",
};

export function findPublishedUnit(unitId: string): PublicUnitSummary | undefined {
  for (const property of [mockProperty]) {
    const unit = property.units.find((u) => u.id === unitId);
    if (unit) {
      return unit;
    }
  }
  return undefined;
}
