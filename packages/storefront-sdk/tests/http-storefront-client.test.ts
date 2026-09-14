import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpStorefrontClient } from "../src/client/HttpStorefrontClient.js";
import { MOCK_PUBLISHABLE_KEY } from "../src/mock/fixtures.js";

describe("HttpStorefrontClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("calls availability check with bearer token", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        data: {
          available: true,
          reasons: [],
          nights: [],
          minNights: 1,
          maxNights: 30,
        },
        error: null,
        meta: { requestId: "req-1", locale: "en-US" },
      }),
    });

    const client = new HttpStorefrontClient({
      publishableKey: MOCK_PUBLISHABLE_KEY,
      baseUrl: "https://api.example.com",
    });

    const result = await client.checkAvailability("unit-1", {
      checkIn: "2026-08-01",
      checkOut: "2026-08-05",
      guestCount: 2,
    });

    expect(result.available).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/storefront/v1/availability/check",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${MOCK_PUBLISHABLE_KEY}`,
        }),
      }),
    );
  });

  it("requires idempotency key for createHold", async () => {
    const client = new HttpStorefrontClient({
      publishableKey: MOCK_PUBLISHABLE_KEY,
      baseUrl: "https://api.example.com",
    });

    await expect(
      client.createHold({
        unitId: "unit-1",
        checkIn: "2026-08-01",
        checkOut: "2026-08-05",
        guestCount: 2,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("createStorefrontClient", () => {
  it("returns mock client when mock flag is true", async () => {
    const { createStorefrontClient } = await import("../src/client/createStorefrontClient.js");
    const client = createStorefrontClient({
      publishableKey: MOCK_PUBLISHABLE_KEY,
      mock: true,
    });

    const property = await client.getProperty("aegean-villa");
    expect(property.slug).toBe("aegean-villa");
  });
});
