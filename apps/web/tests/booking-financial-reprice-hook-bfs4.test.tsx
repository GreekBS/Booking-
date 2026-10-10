/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/admin/api";

const previewBookingFinancialReprice = vi.fn();
const applyBookingFinancialReprice = vi.fn();

vi.mock("@/lib/admin/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/api")>(
    "@/lib/admin/api",
  );
  return {
    ...actual,
    previewBookingFinancialReprice: (...args: unknown[]) =>
      previewBookingFinancialReprice(...args),
    applyBookingFinancialReprice: (...args: unknown[]) =>
      applyBookingFinancialReprice(...args),
  };
});

import {
  buildFinancialRepriceFingerprint,
  isFinancialRepriceConfirmationExpired,
  useBookingFinancialReprice,
  type FinancialRepriceCommittedStay,
} from "@/features/bookings/workspace/hooks/useBookingFinancialReprice";

const TENANT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const UNIT = "33333333-3333-4333-8333-333333333333";
const QUOTE = "44444444-4444-4444-8444-444444444444";
const TOKEN = "token-aaaaaaaaaaaaaaaa";

const stay: FinancialRepriceCommittedStay = {
  bookingId: BOOKING,
  unitId: UNIT,
  checkIn: "2026-08-01",
  checkOut: "2026-08-04",
  guestCount: 2,
  quoteId: QUOTE,
};

function previewPayload(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    unchanged: false,
    reasons: [],
    current: {
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      unitId: stay.unitId,
      guestCount: stay.guestCount,
      totalAmount: "300.0000",
      currency: "EUR",
    },
    proposed: {
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      unitId: stay.unitId,
      guestCount: stay.guestCount,
      totalAmount: "450.0000",
      currency: "EUR",
    },
    priceDelta: { amount: "150.0000", currency: "EUR" },
    pricingIntent: "recalculate_from_rate_plan",
    proposedCommercial: {
      subtotalAmount: "450.0000",
      feesAmount: "0.0000",
      taxesAmount: "0.0000",
      discountAmount: "0.0000",
      totalAmount: "450.0000",
      currency: "EUR",
      lineItems: [],
      ratePlanFingerprint: "rp",
      pricingFingerprint: "a".repeat(64),
    },
    bookingId: BOOKING,
    currentQuoteId: QUOTE,
    reason: "Commercial correction",
    confirmationToken: TOKEN,
    confirmationExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe("BFS-4 useBookingFinancialReprice", () => {
  beforeEach(() => {
    previewBookingFinancialReprice.mockReset();
    applyBookingFinancialReprice.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects short reasons before calling preview", async () => {
    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );

    act(() => {
      result.current.setReason("ab");
    });
    await act(async () => {
      await result.current.requestPreview();
    });

    expect(previewBookingFinancialReprice).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
    expect(result.current.errorKind).toBe("validation");
  });

  it("transitions idle → previewing → preview_ready and never auto-applies", async () => {
    let resolvePreview: (value: unknown) => void = () => undefined;
    previewBookingFinancialReprice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );

    act(() => {
      result.current.setReason("Commercial correction");
    });

    let previewDone!: Promise<void>;
    act(() => {
      previewDone = result.current.requestPreview();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("previewing");
    });

    await act(async () => {
      resolvePreview(previewPayload());
      await previewDone;
    });

    expect(result.current.status).toBe("preview_ready");
    expect(result.current.preview?.priceDelta?.amount).toBe("150.0000");
    expect(result.current.preview).not.toHaveProperty("confirmationToken");
    expect(applyBookingFinancialReprice).not.toHaveBeenCalled();
    expect(JSON.stringify(result.current)).not.toContain(TOKEN);
  });

  it("requires explicit confirmApply before calling apply", async () => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    applyBookingFinancialReprice.mockResolvedValue({
      bookingId: BOOKING,
      amendmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      previousQuoteId: QUOTE,
      newQuoteId: "55555555-5555-4555-8555-555555555555",
      previousTotalAmount: "300.0000",
      newTotalAmount: "450.0000",
      deltaAmount: "150.0000",
      currency: "EUR",
      replayed: false,
    });

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );

    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    expect(applyBookingFinancialReprice).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmApply();
    });

    expect(applyBookingFinancialReprice).toHaveBeenCalledTimes(1);
    expect(applyBookingFinancialReprice).toHaveBeenCalledWith(
      TENANT,
      BOOKING,
      { confirmationToken: TOKEN, reason: "Commercial correction" },
    );
    expect(result.current.status).toBe("success");
    expect(result.current.applyResult?.replayed).toBe(false);
  });

  it("treats replayed:true as success", async () => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    applyBookingFinancialReprice.mockResolvedValue({
      bookingId: BOOKING,
      amendmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      previousQuoteId: QUOTE,
      newQuoteId: "55555555-5555-4555-8555-555555555555",
      previousTotalAmount: "300.0000",
      newTotalAmount: "450.0000",
      deltaAmount: "150.0000",
      currency: "EUR",
      replayed: true,
    });

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );
    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    await act(async () => {
      await result.current.confirmApply();
    });

    expect(result.current.status).toBe("success");
    expect(result.current.applyResult?.replayed).toBe(true);
  });

  it("blocks apply when confirmation token is expired", async () => {
    previewBookingFinancialReprice.mockResolvedValue(
      previewPayload({
        confirmationExpiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );
    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    await act(async () => {
      await result.current.confirmApply();
    });

    expect(applyBookingFinancialReprice).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
    expect(result.current.errorKind).toBe("token_invalid");
  });

  it("invalidates preview when committed stay or reason changes", async () => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    const { result, rerender } = renderHook(
      ({ committedStay }) =>
        useBookingFinancialReprice({ tenantId: TENANT, committedStay }),
      { initialProps: { committedStay: stay } },
    );

    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    expect(result.current.status).toBe("preview_ready");

    act(() => {
      result.current.setReason("Commercial correction changed");
    });
    await waitFor(() => {
      expect(result.current.status).toBe("idle");
      expect(result.current.preview).toBeNull();
    });

    await act(async () => {
      await result.current.requestPreview();
    });
    expect(result.current.status).toBe("preview_ready");

    rerender({
      committedStay: { ...stay, quoteId: "66666666-6666-4666-8666-666666666666" },
    });
    await waitFor(() => {
      expect(result.current.status).toBe("idle");
      expect(result.current.preview).toBeNull();
    });
  });

  it("prevents duplicate in-flight apply submissions", async () => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    let resolveApply: (value: unknown) => void = () => undefined;
    applyBookingFinancialReprice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );
    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });

    let first!: Promise<void>;
    act(() => {
      first = result.current.confirmApply();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("applying");
    });

    await act(async () => {
      await result.current.confirmApply();
    });
    expect(applyBookingFinancialReprice).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveApply({
        bookingId: BOOKING,
        amendmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        previousQuoteId: QUOTE,
        newQuoteId: "55555555-5555-4555-8555-555555555555",
        previousTotalAmount: "300.0000",
        newTotalAmount: "450.0000",
        deltaAmount: "150.0000",
        currency: "EUR",
        replayed: false,
      });
      await first;
    });
    expect(result.current.status).toBe("success");
  });

  it("keeps the same token for retry after ambiguous network failure", async () => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    applyBookingFinancialReprice
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        bookingId: BOOKING,
        amendmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        previousQuoteId: QUOTE,
        newQuoteId: "55555555-5555-4555-8555-555555555555",
        previousTotalAmount: "300.0000",
        newTotalAmount: "450.0000",
        deltaAmount: "150.0000",
        currency: "EUR",
        replayed: true,
      });

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );
    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    await act(async () => {
      await result.current.confirmApply();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.canRetryApply).toBe(true);
    expect(previewBookingFinancialReprice).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retryApply();
    });

    expect(previewBookingFinancialReprice).toHaveBeenCalledTimes(1);
    expect(applyBookingFinancialReprice).toHaveBeenCalledTimes(2);
    expect(applyBookingFinancialReprice.mock.calls[1][2]).toEqual({
      confirmationToken: TOKEN,
      reason: "Commercial correction",
    });
    expect(result.current.status).toBe("success");
  });

  it("clears workflow on booking switch and reset", async () => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    const { result, rerender } = renderHook(
      ({ bookingId }) =>
        useBookingFinancialReprice({
          tenantId: TENANT,
          committedStay: { ...stay, bookingId },
        }),
      { initialProps: { bookingId: BOOKING } },
    );

    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    expect(result.current.status).toBe("preview_ready");

    rerender({ bookingId: "77777777-7777-4777-8777-777777777777" });
    await waitFor(() => {
      expect(result.current.status).toBe("idle");
      expect(result.current.preview).toBeNull();
      expect(result.current.reason).toBe("");
    });

    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.preview).toBeNull();
  });

  it("builds fingerprints and detects expired confirmations", () => {
    expect(
      buildFinancialRepriceFingerprint(stay, "  reason  "),
    ).toContain(QUOTE);
    expect(
      isFinancialRepriceConfirmationExpired(
        new Date(Date.now() - 1).toISOString(),
      ),
    ).toBe(true);
    expect(
      isFinancialRepriceConfirmationExpired(
        new Date(Date.now() + 60_000).toISOString(),
      ),
    ).toBe(false);
  });

  it("preview network failure does not enable apply retry", async () => {
    previewBookingFinancialReprice.mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );
    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.canRetryApply).toBe(false);
    expect(applyBookingFinancialReprice).not.toHaveBeenCalled();
  });

  it("definite server rejection is not ambiguous and clears the token", async () => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    applyBookingFinancialReprice.mockRejectedValue(
      new AdminApiError(
        "VALIDATION_ERROR",
        "Confirmation is stale: booking quote or agreed total changed since preview",
        400,
      ),
    );

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );
    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    await act(async () => {
      await result.current.confirmApply();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorKind).toBe("stale");
    expect(result.current.canRetryApply).toBe(false);
    expect(result.current.preview).toBeNull();
  });

  it("after apply was sent, client expiry does not block same-token retry", async () => {
    const expiresSoon = new Date(Date.now() + 60_000).toISOString();
    previewBookingFinancialReprice.mockResolvedValue(
      previewPayload({ confirmationExpiresAt: expiresSoon }),
    );
    applyBookingFinancialReprice
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        bookingId: BOOKING,
        amendmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        previousQuoteId: QUOTE,
        newQuoteId: "55555555-5555-4555-8555-555555555555",
        previousTotalAmount: "300.0000",
        newTotalAmount: "450.0000",
        deltaAmount: "150.0000",
        currency: "EUR",
        replayed: true,
      });

    const { result } = renderHook(() =>
      useBookingFinancialReprice({ tenantId: TENANT, committedStay: stay }),
    );
    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });
    await act(async () => {
      await result.current.confirmApply();
    });
    expect(result.current.canRetryApply).toBe(true);

    // Wall-clock past preview expiry after the ambiguous apply was already sent.
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse(expiresSoon) + 5_000);

    await act(async () => {
      await result.current.retryApply();
    });
    nowSpy.mockRestore();

    expect(applyBookingFinancialReprice).toHaveBeenCalledTimes(2);
    expect(applyBookingFinancialReprice.mock.calls[1][2]).toEqual({
      confirmationToken: TOKEN,
      reason: "Commercial correction",
    });
    expect(result.current.status).toBe("success");
  });

  it("stale apply response after booking switch cannot overwrite state", async () => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    let resolveApply: (value: unknown) => void = () => undefined;
    applyBookingFinancialReprice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ bookingId }) =>
        useBookingFinancialReprice({
          tenantId: TENANT,
          committedStay: { ...stay, bookingId },
        }),
      { initialProps: { bookingId: BOOKING } },
    );

    act(() => result.current.setReason("Commercial correction"));
    await act(async () => {
      await result.current.requestPreview();
    });

    let applyPromise!: Promise<void>;
    act(() => {
      applyPromise = result.current.confirmApply();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("applying");
    });

    const otherBooking = "77777777-7777-4777-8777-777777777777";
    rerender({ bookingId: otherBooking });
    await waitFor(() => {
      expect(result.current.status).toBe("idle");
    });

    await act(async () => {
      resolveApply({
        bookingId: BOOKING,
        amendmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        previousQuoteId: QUOTE,
        newQuoteId: "55555555-5555-4555-8555-555555555555",
        previousTotalAmount: "300.0000",
        newTotalAmount: "450.0000",
        deltaAmount: "150.0000",
        currency: "EUR",
        replayed: false,
      });
      await applyPromise;
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.applyResult).toBeNull();
  });
});
