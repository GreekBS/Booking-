import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyBookingFinancialReprice,
  fetchBookingCommercialAmendments,
  previewBookingFinancialReprice,
} from "@/lib/admin/api";

const TENANT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const UNIT = "33333333-3333-4333-8333-333333333333";

describe("BFS-4 financial reprice admin client helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("previewBookingFinancialReprice posts geometry + reason only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        unchanged: false,
        reasons: [],
        current: {
          checkIn: "2026-08-01",
          checkOut: "2026-08-04",
          unitId: UNIT,
          guestCount: 2,
          totalAmount: "300.0000",
          currency: "EUR",
        },
        proposed: {
          checkIn: "2026-08-01",
          checkOut: "2026-08-04",
          unitId: UNIT,
          guestCount: 2,
          totalAmount: "450.0000",
          currency: "EUR",
        },
        priceDelta: { amount: "150.0000", currency: "EUR" },
        pricingIntent: "recalculate_from_rate_plan",
        proposedCommercial: null,
        bookingId: BOOKING,
        currentQuoteId: "44444444-4444-4444-8444-444444444444",
        reason: "Commercial correction",
        confirmationToken: "token-aaaaaaaaaaaaaaaa",
        confirmationExpiresAt: "2026-01-01T12:10:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await previewBookingFinancialReprice(TENANT, BOOKING, {
      unitId: UNIT,
      checkIn: "2026-08-01",
      checkOut: "2026-08-04",
      guestCount: 2,
      reason: "Commercial correction",
    });

    expect(result.confirmationToken).toMatch(/^token-/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/admin/v1/bookings/${BOOKING}/financial-reprice/preview`,
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("X-Tenant-Id")).toBe(TENANT);
    expect(JSON.parse(String(init.body))).toEqual({
      unitId: UNIT,
      checkIn: "2026-08-01",
      checkOut: "2026-08-04",
      guestCount: 2,
      reason: "Commercial correction",
    });
  });

  it("applyBookingFinancialReprice posts token + reason only (no totals)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bookingId: BOOKING,
        amendmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        previousQuoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        newQuoteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        previousTotalAmount: "300.0000",
        newTotalAmount: "450.0000",
        deltaAmount: "150.0000",
        currency: "EUR",
        replayed: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await applyBookingFinancialReprice(TENANT, BOOKING, {
      confirmationToken: "token-bbbbbbbbbbbbbbbb",
      reason: "Commercial correction",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/admin/v1/bookings/${BOOKING}/financial-reprice/apply`,
    );
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      confirmationToken: "token-bbbbbbbbbbbbbbbb",
      reason: "Commercial correction",
    });
    expect(body).not.toHaveProperty("totalAmount");
    expect(body).not.toHaveProperty("newTotalAmount");
    expect(body).not.toHaveProperty("priceDelta");
  });

  it("fetchBookingCommercialAmendments GETs and unwraps amendments", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        amendments: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            bookingId: BOOKING,
            propertyId: "33333333-3333-4333-8333-333333333333",
            previousQuoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            newQuoteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            previousTotalAmount: "300.0000",
            newTotalAmount: "450.0000",
            deltaAmount: "150.0000",
            currency: "EUR",
            pricingIntent: "recalculate_from_rate_plan",
            reason: "Rate plan correction",
            actorId: "user-1",
            mutationOrigin: "operator",
            createdAt: "2026-01-02T10:00:00.000Z",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await fetchBookingCommercialAmendments(TENANT, BOOKING);
    expect(items).toHaveLength(1);
    expect(items[0].deltaAmount).toBe("150.0000");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `/api/admin/v1/bookings/${BOOKING}/commercial-amendments`,
    );
    expect(init.method ?? "GET").toBe("GET");
  });
});
