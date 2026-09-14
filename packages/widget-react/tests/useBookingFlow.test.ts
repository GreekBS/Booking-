import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBookingFlow } from "../src/useBookingFlow.js";
import type { IStorefrontClient, WidgetEvent } from "@hcp/storefront-sdk";

function createMockClient(overrides: Partial<IStorefrontClient> = {}): IStorefrontClient {
  return {
    getConfig: vi.fn(),
    getWidgetConfig: vi.fn(),
    listProperties: vi.fn(),
    getProperty: vi.fn(),
    getUnit: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({
      available: true,
      reasons: [],
      nights: [],
      minNights: 1,
      maxNights: 14,
    }),
    previewPrice: vi.fn().mockResolvedValue({
      currency: "EUR",
      lineItems: [],
      subtotal: "300.0000",
      total: "300.0000",
      checkIn: "2025-08-01",
      checkOut: "2025-08-04",
    }),
    searchAvailability: vi.fn(),
    createHold: vi.fn(),
    releaseHold: vi.fn(),
    createQuote: vi.fn(),
    getQuote: vi.fn(),
    createBooking: vi.fn(),
    getBooking: vi.fn(),
    ...overrides,
  } as IStorefrontClient;
}

describe("useBookingFlow", () => {
  it("checks availability and advances to guest step", async () => {
    const client = createMockClient();
    const events: WidgetEvent[] = [];

    const { result } = renderHook(() =>
      useBookingFlow({
        client,
        mockMode: true,
        unitId: "unit_1",
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 2,
        onEvent: (e) => events.push(e),
      }),
    );

    await act(async () => {
      await result.current.checkAvailability();
    });

    await waitFor(() => {
      expect(result.current.state.step).toBe("guest");
    });
    expect(result.current.state.total).toBe("300.0000");
    expect(events.some((e) => e.type === "availability_checked")).toBe(true);
  });

  it("completes hold quote booking chain", async () => {
    const client = createMockClient({
      createHold: vi.fn().mockResolvedValue({
        id: "hold_1",
        unitId: "unit_1",
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 2,
        expiresAt: new Date().toISOString(),
      }),
      createQuote: vi.fn().mockResolvedValue({
        id: "quote_1",
        holdId: "hold_1",
        expiresAt: new Date().toISOString(),
        snapshot: {
          checkIn: "2025-08-01",
          checkOut: "2025-08-04",
          currency: "EUR",
          lineItems: [],
          subtotal: "300.0000",
          fees: "0.0000",
          taxes: "0.0000",
          total: "300.0000",
        },
      }),
      createBooking: vi.fn().mockResolvedValue({
        id: "booking_1",
        status: "pending",
        confirmationCode: "HCP-FLOW-1",
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guest: { name: "Guest", email: "g@test.com" },
      }),
    });

    const { result } = renderHook(() =>
      useBookingFlow({
        client,
        mockMode: false,
        unitId: "unit_1",
        checkIn: "2025-08-01",
        checkOut: "2025-08-04",
        guestCount: 2,
      }),
    );

    act(() => {
      result.current.setGuest({ name: "Guest", email: "g@test.com", phone: "" });
      result.current.setStep("confirm");
    });

    await act(async () => {
      await result.current.confirmBooking();
    });

    expect(result.current.state.step).toBe("success");
    expect(result.current.state.confirmationCode).toBe("HCP-FLOW-1");
    expect(client.createHold).toHaveBeenCalled();
    expect(client.createQuote).toHaveBeenCalled();
    expect(client.createBooking).toHaveBeenCalled();
  });
});
