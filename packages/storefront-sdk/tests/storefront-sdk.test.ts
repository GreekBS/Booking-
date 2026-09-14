import { describe, it, expect } from "vitest";
import {
  createMockStorefrontClient,
  MOCK_PUBLISHABLE_KEY,
  themeConfigSchema,
  defaultTheme,
  mergeThemes,
  themeToCssVariables,
  publishableKeySchema,
  publicHoldSchema,
  publicQuoteSchema,
  publicBookingSchema,
  stayQuerySchema,
} from "../src/index.js";

describe("publishable key schema", () => {
  it("accepts valid test key", () => {
    expect(publishableKeySchema.parse(MOCK_PUBLISHABLE_KEY)).toBe(MOCK_PUBLISHABLE_KEY);
  });

  it("rejects invalid key format", () => {
    expect(() => publishableKeySchema.parse("sk_secret")).toThrow();
  });
});

describe("stay query schema", () => {
  it("validates checkIn/checkOut/guestCount", () => {
    const parsed = stayQuerySchema.parse({
      checkIn: "2025-08-01",
      checkOut: "2025-08-04",
      guestCount: 2,
    });
    expect(parsed.guestCount).toBe(2);
  });
});

describe("theme schema", () => {
  it("validates default theme", () => {
    expect(themeConfigSchema.parse(defaultTheme)).toBeDefined();
  });

  it("merges theme overrides", () => {
    const merged = mergeThemes(defaultTheme, {
      colors: { ...defaultTheme.colors, primary: "#000000" },
    });
    expect(merged.colors.primary).toBe("#000000");
    expect(merged.colors.error).toBe(defaultTheme.colors.error);
  });

  it("maps theme to CSS variables", () => {
    const vars = themeToCssVariables(defaultTheme);
    expect(vars["--hcp-color-primary"]).toBe(defaultTheme.colors.primary);
  });
});

describe("mock Hold → Quote → Booking flow", () => {
  const client = createMockStorefrontClient({
    publishableKey: MOCK_PUBLISHABLE_KEY,
  });

  it("completes checkout flow", async () => {
    const hold = await client.createHold({
      unitId: "unit-villa-entire",
      checkIn: "2025-08-01",
      checkOut: "2025-08-04",
      guestCount: 2,
    });
    expect(publicHoldSchema.parse(hold).id).toBeTruthy();

    const quote = await client.createQuote({ holdId: hold.id });
    expect(publicQuoteSchema.parse(quote).holdId).toBe(hold.id);

    const booking = await client.createBooking(
      {
        quoteId: quote.id,
        guest: { name: "Jane Doe", email: "jane@example.com" },
      },
      "idem-1",
    );
    expect(publicBookingSchema.parse(booking).confirmationCode).toMatch(/^HCP-/);

    const again = await client.createBooking(
      {
        quoteId: quote.id,
        guest: { name: "Jane Doe", email: "jane@example.com" },
      },
      "idem-1",
    );
    expect(again.id).toBe(booking.id);
  });

  it("rejects booking for unknown unit", async () => {
    await expect(
      client.createHold({
        unitId: "unknown",
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 2,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
