import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { BookingWidget } from "../src/BookingWidget.js";
import { MOCK_PUBLISHABLE_KEY, defaultTheme } from "@hcp/storefront-sdk";
import type { WidgetEvent } from "@hcp/storefront-sdk";

afterEach(() => {
  cleanup();
});

describe("BookingWidget mock mode", () => {
  it("emits ready and completes mock booking flow", async () => {
    const events: WidgetEvent[] = [];
    render(
      <BookingWidget
        publishableKey={MOCK_PUBLISHABLE_KEY}
        mockMode
        onEvent={(e) => events.push(e)}
      />,
    );

    await waitFor(() => {
      expect(events.some((e) => e.type === "ready")).toBe(true);
    });

    fireEvent.click(screen.getByTestId("check-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("price-total")).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("guest-name"), { target: { value: "Test Guest" } });
    fireEvent.change(screen.getByTestId("guest-email"), { target: { value: "guest@test.com" } });
    fireEvent.click(screen.getByTestId("guest-continue"));
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("confirmation-code").textContent).toMatch(/HCP-/);
    });

    expect(events.some((e) => e.type === "booking_completed")).toBe(true);
    expect(events.some((e) => e.type === "hold_created")).toBe(true);
  });

  it("applies theme CSS variables on root", () => {
    const { container } = render(
      <BookingWidget
        publishableKey={MOCK_PUBLISHABLE_KEY}
        theme={{ colors: { ...defaultTheme.colors, primary: "#112233" } }}
      />,
    );
    const root = container.querySelector("[data-hcp-widget-root]") as HTMLElement;
    expect(root.style.getPropertyValue("--hcp-color-primary")).toBe("#112233");
  });
});

describe("BookingWidget live mode with mocked client", () => {
  it("uses injected client for availability and booking", async () => {
    const events: WidgetEvent[] = [];
    const mockClient = {
      getProperty: vi.fn(),
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
        subtotal: "200.0000",
        total: "200.0000",
        checkIn: "2025-09-01",
        checkOut: "2025-09-04",
      }),
      createHold: vi.fn().mockResolvedValue({
        id: "hold_1",
        unitId: "unit_1",
        checkIn: "2025-09-01",
        checkOut: "2025-09-04",
        guestCount: 2,
        expiresAt: new Date().toISOString(),
      }),
      createQuote: vi.fn().mockResolvedValue({
        id: "quote_1",
        holdId: "hold_1",
        expiresAt: new Date().toISOString(),
        snapshot: {
          checkIn: "2025-09-01",
          checkOut: "2025-09-04",
          currency: "EUR",
          lineItems: [],
          subtotal: "200.0000",
          fees: "0.0000",
          taxes: "0.0000",
          total: "200.0000",
        },
      }),
      createBooking: vi.fn().mockResolvedValue({
        id: "booking_1",
        status: "pending",
        confirmationCode: "HCP-LIVE-1",
        checkIn: "2025-09-01",
        checkOut: "2025-09-04",
        guest: { name: "Live Guest", email: "live@test.com" },
      }),
    };

    render(
      <BookingWidget
        publishableKey="pk_test_live00000000000001"
        mockMode={false}
        baseUrl="https://api.example.com"
        unitId="unit_1"
        checkIn="2025-09-01"
        checkOut="2025-09-04"
        client={mockClient as never}
        onEvent={(e) => events.push(e)}
      />,
    );

    fireEvent.click(screen.getByTestId("check-btn"));

    await waitFor(() => {
      expect(mockClient.checkAvailability).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByTestId("guest-name"), { target: { value: "Live Guest" } });
    fireEvent.change(screen.getByTestId("guest-email"), { target: { value: "live@test.com" } });
    fireEvent.click(screen.getByTestId("guest-continue"));
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("confirmation-code").textContent).toContain("HCP-LIVE-1");
    });

    expect(mockClient.createHold).toHaveBeenCalled();
    expect(mockClient.createQuote).toHaveBeenCalled();
    expect(mockClient.createBooking).toHaveBeenCalled();
    expect(events.some((e) => e.type === "booking_completed")).toBe(true);
  });
});
