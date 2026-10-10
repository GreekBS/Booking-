/** @vitest-environment jsdom */
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previewBookingFinancialReprice = vi.fn();
const applyBookingFinancialReprice = vi.fn();
const fetchBookingCommercialAmendments = vi.fn();
const toastSuccess = vi.fn();

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
    fetchBookingCommercialAmendments: (...args: unknown[]) =>
      fetchBookingCommercialAmendments(...args),
  };
});

vi.mock("@/lib/admin/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: vi.fn(),
}));

const tenantState = {
  role: "admin" as string,
  platformRole: null as string | null,
};

vi.mock("@/hooks/use-tenant", () => ({
  useTenant: () => ({
    tenantId: "tenant-1",
    profile: {
      user: {
        id: "u1",
        email: "a@example.com",
        name: "Admin",
        platformRole: tenantState.platformRole,
        emailVerified: null,
      },
      memberships: [
        {
          id: "m1",
          tenantId: "tenant-1",
          tenantName: "Tenant",
          tenantSlug: "tenant",
          role: tenantState.role,
          propertyIds: tenantState.role === "manager" ? ["prop-1"] : null,
          status: "active",
        },
      ],
      activeTenantId: "tenant-1",
    },
    tenantName: "Tenant",
    loading: false,
    error: null,
    refresh: vi.fn(),
    switchTenant: vi.fn(),
  }),
}));

import { BookingFinancialRepricePanel } from "@/features/bookings/workspace/sections/BookingFinancialRepricePanel";
import { BookingCommercialAmendmentsSection } from "@/features/bookings/workspace/sections/BookingCommercialAmendmentsSection";
import { BookingFinancialRepriceDialog } from "@/features/bookings/workspace/BookingFinancialRepriceDialog";
import { canAdjustBookingFinancials } from "@/lib/admin/can-adjust-booking-financials";
import type { BookingRecord, QuoteRecord } from "@/lib/admin/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TOKEN = "secret-confirmation-token-should-never-render";

const booking: BookingRecord = {
  id: "booking-1",
  tenantId: "tenant-1",
  propertyId: "prop-1",
  unitId: "unit-1",
  quoteId: "quote-1",
  quoteSnapshotId: "snap-1",
  holdId: "hold-1",
  checkIn: "2027-06-01",
  checkOut: "2027-06-04",
  guestCount: 2,
  guest: { name: "Guest", email: null, phone: null },
  status: "confirmed",
  confirmationMode: "manual",
};

function quote(
  pricingMode: QuoteRecord["pricingMode"] = "talos_calculated",
): QuoteRecord {
  return {
    id: "quote-1",
    tenantId: "tenant-1",
    holdId: "hold-1",
    unitId: "unit-1",
    propertyId: "prop-1",
    snapshotId: "snap-1",
    currency: "EUR",
    subtotalAmount: "300.0000",
    feesAmount: "0.0000",
    taxesAmount: "0.0000",
    totalAmount: "300.0000",
    lineItems: [],
    pricingMode,
    quotedAt: "2027-01-01T00:00:00.000Z",
    expiresAt: "2027-01-02T00:00:00.000Z",
    createdAt: "2027-01-01T00:00:00.000Z",
  };
}

function previewPayload() {
  return {
    available: true,
    unchanged: false,
    reasons: [],
    current: {
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      unitId: booking.unitId,
      guestCount: booking.guestCount,
      totalAmount: "300.0000",
      currency: "EUR",
    },
    proposed: {
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      unitId: booking.unitId,
      guestCount: booking.guestCount,
      totalAmount: "450.0000",
      currency: "EUR",
    },
    priceDelta: { amount: "150.0000", currency: "EUR" },
    pricingIntent: "recalculate_from_rate_plan" as const,
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
    bookingId: booking.id,
    currentQuoteId: booking.quoteId,
    reason: "Διόρθωση εμπορικής τιμής",
    confirmationToken: TOKEN,
    confirmationExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

afterEach(() => {
  cleanup();
  tenantState.role = "admin";
  tenantState.platformRole = null;
  previewBookingFinancialReprice.mockReset();
  applyBookingFinancialReprice.mockReset();
  fetchBookingCommercialAmendments.mockReset();
  toastSuccess.mockReset();
});

describe("BFS-4 BookingFinancialRepricePanel", () => {
  it("hides action for managers", () => {
    tenantState.role = "manager";
    const canAdjust = canAdjustBookingFinancials(
      {
        user: {
          id: "u1",
          email: "a@example.com",
          name: "M",
          platformRole: null,
          emailVerified: null,
        },
        memberships: [
          {
            id: "m1",
            tenantId: "tenant-1",
            tenantName: "T",
            tenantSlug: "t",
            role: "manager",
            propertyIds: ["prop-1"],
            status: "active",
          },
        ],
        activeTenantId: "tenant-1",
      },
      "tenant-1",
    );
    render(
      <BookingFinancialRepricePanel
        tenantId="tenant-1"
        booking={booking}
        quote={quote()}
        canAdjust={canAdjust}
        stayDirty={false}
        onApplied={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("financial-reprice-open"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Προσαρμογή συμφωνημένης τιμής"),
    ).not.toBeInTheDocument();
  });

  it("shows disabled action for dirty stay", () => {
    render(
      <BookingFinancialRepricePanel
        tenantId="tenant-1"
        booking={booking}
        quote={quote()}
        canAdjust
        stayDirty
        onApplied={vi.fn()}
      />,
    );
    const btn = screen.getByTestId("financial-reprice-open");
    expect(btn).toBeDisabled();
    expect(
      screen.getByText(/μη αποθηκευμένες αλλαγές διαμονής/i),
    ).toBeInTheDocument();
  });

  it("explains unknown pricingMode null and keeps CTA disabled", () => {
    render(
      <BookingFinancialRepricePanel
        tenantId="tenant-1"
        booking={booking}
        quote={quote(null)}
        canAdjust
        stayDirty={false}
        onApplied={vi.fn()}
      />,
    );
    expect(screen.getByTestId("financial-reprice-open")).toBeDisabled();
    expect(screen.getByText(/παλαιά εγγραφή/i)).toBeInTheDocument();
  });

  it("explains imported_csv pricing mode", () => {
    render(
      <BookingFinancialRepricePanel
        tenantId="tenant-1"
        booking={booking}
        quote={quote("imported_csv")}
        canAdjust
        stayDirty={false}
        onApplied={vi.fn()}
      />,
    );
    expect(screen.getByTestId("financial-reprice-open")).toBeDisabled();
    expect(screen.getByText(/εισαγωγή \(CSV\)/i)).toBeInTheDocument();
  });
});

describe("BFS-4 BookingFinancialRepriceDialog", () => {
  beforeEach(() => {
    previewBookingFinancialReprice.mockResolvedValue(previewPayload());
    applyBookingFinancialReprice.mockResolvedValue({
      bookingId: booking.id,
      amendmentId: "amd-1",
      previousQuoteId: "quote-1",
      newQuoteId: "quote-2",
      previousTotalAmount: "300.0000",
      newTotalAmount: "450.0000",
      deltaAmount: "150.0000",
      currency: "EUR",
      replayed: false,
    });
  });

  it("requires reason, confirmation checkbox, preview then confirmApply; never leaks token", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(
      <BookingFinancialRepriceDialog
        open
        onOpenChange={vi.fn()}
        tenantId="tenant-1"
        committedStay={{
          bookingId: booking.id,
          unitId: booking.unitId,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guestCount: booking.guestCount,
          quoteId: booking.quoteId,
        }}
        onSuccess={onSuccess}
      />,
    );

    expect(
      screen.getByText(/Δεν εισπράττεται ούτε επιστρέφεται πληρωμή αυτόματα/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Προεπισκόπηση" }));
    expect(previewBookingFinancialReprice).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText(/Λόγος προσαρμογής/i),
      "Διόρθωση εμπορικής τιμής",
    );
    await user.click(screen.getByRole("button", { name: "Προεπισκόπηση" }));

    await waitFor(() => {
      expect(previewBookingFinancialReprice).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/Τρέχον συμφωνημένο σύνολο/i)).toBeInTheDocument();
    expect(screen.getByText(/Προτεινόμενο συμφωνημένο σύνολο/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TOKEN);

    const applyBtn = screen.getByRole("button", { name: "Εφαρμογή νέας τιμής" });
    expect(applyBtn).toBeDisabled();

    await user.click(
      screen.getByLabelText(/Επιβεβαιώνω την εφαρμογή της νέας συμφωνημένης τιμής/i),
    );
    expect(applyBtn).toBeEnabled();

    await user.click(applyBtn);
    await waitFor(() => {
      expect(applyBookingFinancialReprice).toHaveBeenCalledTimes(1);
    });
    const applyArgs = applyBookingFinancialReprice.mock.calls[0];
    expect(applyArgs?.[2]).toMatchObject({
      confirmationToken: TOKEN,
      reason: "Διόρθωση εμπορικής τιμής",
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("offers same-token retry after ambiguous network failure and supports post-expiry recovery path", async () => {
    const user = userEvent.setup();
    applyBookingFinancialReprice
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        bookingId: booking.id,
        amendmentId: "amd-1",
        previousQuoteId: "quote-1",
        newQuoteId: "quote-2",
        previousTotalAmount: "300.0000",
        newTotalAmount: "450.0000",
        deltaAmount: "150.0000",
        currency: "EUR",
        replayed: true,
      });

    const onSuccess = vi.fn();
    render(
      <BookingFinancialRepriceDialog
        open
        onOpenChange={vi.fn()}
        tenantId="tenant-1"
        committedStay={{
          bookingId: booking.id,
          unitId: booking.unitId,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guestCount: booking.guestCount,
          quoteId: booking.quoteId,
        }}
        onSuccess={onSuccess}
      />,
    );

    await user.type(
      screen.getByLabelText(/Λόγος προσαρμογής/i),
      "Διόρθωση εμπορικής τιμής",
    );
    await user.click(screen.getByRole("button", { name: "Προεπισκόπηση" }));
    await screen.findByText(/Τρέχον συμφωνημένο σύνολο/i);
    const confirm = screen.getByLabelText(
      /Επιβεβαιώνω την εφαρμογή της νέας συμφωνημένης τιμής/i,
    );
    await user.click(confirm);
    await user.click(screen.getByRole("button", { name: "Εφαρμογή νέας τιμής" }));

    const retryBtn = await screen.findByRole("button", {
      name: "Επανάληψη εφαρμογής",
    });
    expect(previewBookingFinancialReprice).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain(TOKEN);

    // Explicit confirmation remains mandatory for retry.
    await user.click(confirm);
    expect(retryBtn).toBeDisabled();
    await user.click(confirm);
    expect(retryBtn).toBeEnabled();

    await user.click(retryBtn);
    await waitFor(() => {
      expect(applyBookingFinancialReprice).toHaveBeenCalledTimes(2);
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ replayed: true }),
      );
    });
    // Retry must not mint a new preview/token.
    expect(previewBookingFinancialReprice).toHaveBeenCalledTimes(1);
  });

  it("closing the dialog clears token-bearing workflow state", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <BookingFinancialRepriceDialog
        open
        onOpenChange={onOpenChange}
        tenantId="tenant-1"
        committedStay={{
          bookingId: booking.id,
          unitId: booking.unitId,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guestCount: booking.guestCount,
          quoteId: booking.quoteId,
        }}
        onSuccess={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText(/Λόγος προσαρμογής/i),
      "Διόρθωση εμπορικής τιμής",
    );
    await user.click(screen.getByRole("button", { name: "Προεπισκόπηση" }));
    await screen.findByText(/Τρέχον συμφωνημένο σύνολο/i);
    expect(document.body.textContent).not.toContain(TOKEN);

    rerender(
      <BookingFinancialRepriceDialog
        open={false}
        onOpenChange={onOpenChange}
        tenantId="tenant-1"
        committedStay={{
          bookingId: booking.id,
          unitId: booking.unitId,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guestCount: booking.guestCount,
          quoteId: booking.quoteId,
        }}
        onSuccess={vi.fn()}
      />,
    );

    rerender(
      <BookingFinancialRepriceDialog
        open
        onOpenChange={onOpenChange}
        tenantId="tenant-1"
        committedStay={{
          bookingId: booking.id,
          unitId: booking.unitId,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guestCount: booking.guestCount,
          quoteId: booking.quoteId,
        }}
        onSuccess={vi.fn()}
      />,
    );

    // Fresh open returns to reason step — prior preview/token is gone.
    expect(
      screen.getByRole("button", { name: "Προεπισκόπηση" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Εφαρμογή νέας τιμής" }),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TOKEN);
  });
});

describe("BFS-4 BookingFinancialRepricePanel lifecycle", () => {
  it("closes open dialog when booking or tenant changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <BookingFinancialRepricePanel
        tenantId="tenant-1"
        booking={booking}
        quote={quote()}
        canAdjust
        stayDirty={false}
        onApplied={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("financial-reprice-open"));
    expect(
      await screen.findByRole("heading", {
        name: "Προσαρμογή συμφωνημένης τιμής",
      }),
    ).toBeInTheDocument();

    rerender(
      <BookingFinancialRepricePanel
        tenantId="tenant-1"
        booking={{ ...booking, id: "booking-2", quoteId: "quote-2" }}
        quote={{ ...quote(), id: "quote-2" }}
        canAdjust
        stayDirty={false}
        onApplied={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: "Προσαρμογή συμφωνημένης τιμής",
        }),
      ).not.toBeInTheDocument();
    });
  });
});

describe("BFS-4 BookingCommercialAmendmentsSection", () => {
  it("shows empty, loading, error states and never renders secrets", async () => {
    fetchBookingCommercialAmendments.mockResolvedValueOnce([]);
    const { rerender } = render(
      <BookingCommercialAmendmentsSection bookingId="booking-1" active />,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Δεν υπάρχουν καταγεγραμμένες προσαρμογές/i),
      ).toBeInTheDocument();
    });

    fetchBookingCommercialAmendments.mockRejectedValueOnce(
      new Error("boom"),
    );
    rerender(
      <BookingCommercialAmendmentsSection
        bookingId="booking-1"
        active
        refreshNonce={1}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");

    fetchBookingCommercialAmendments.mockResolvedValueOnce([
      {
        id: "amd-1",
        bookingId: "booking-1",
        propertyId: "prop-1",
        previousQuoteId: "q1",
        newQuoteId: "q2",
        previousTotalAmount: "300.0000",
        newTotalAmount: "450.0000",
        deltaAmount: "150.0000",
        currency: "EUR",
        pricingIntent: "recalculate_from_rate_plan",
        reason: "Διόρθωση",
        actorId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        mutationOrigin: "operator",
        createdAt: "2027-01-02T10:00:00.000Z",
      },
    ]);
    rerender(
      <BookingCommercialAmendmentsSection
        bookingId="booking-1"
        active
        refreshNonce={2}
      />,
    );
    const row = await screen.findByTestId("commercial-amendment-row");
    expect(within(row).getByText("Διόρθωση")).toBeInTheDocument();
    expect(row.textContent).not.toContain("confirmation");
    expect(row.textContent).not.toContain("idempotency");
    expect(row.textContent).not.toContain(TOKEN);
  });
});

describe("BFS-4 workspace integration source contracts", () => {
  it("wires financial reprice into Financials tab without stay auto-reprice", () => {
    const root = join(__dirname, "..");
    const view = readFileSync(
      join(root, "features/bookings/workspace/BookingWorkspaceView.tsx"),
      "utf8",
    );
    expect(view).toContain("BookingFinancialRepricePanel");
    expect(view).toContain("BookingCommercialAmendmentsSection");
    expect(view).toContain("canAdjustBookingFinancials");
    expect(view).toContain("financialRefreshNonce");
    expect(view).toContain("refreshNonce={financialRefreshNonce}");
    // Stay preview/save path remains separate.
    expect(view).toContain("useBookingStayPreview");
    expect(view).toContain("useBookingStaySave");
    expect(view).not.toContain("confirmationToken");

    const panel = readFileSync(
      join(
        root,
        "features/bookings/workspace/sections/BookingFinancialRepricePanel.tsx",
      ),
      "utf8",
    );
    expect(panel).toContain("Προσαρμογή συμφωνημένης τιμής");
  });

  it("dialog applies only through confirmApply / retryApply", () => {
    const root = join(__dirname, "..");
    const dialog = readFileSync(
      join(root, "features/bookings/workspace/BookingFinancialRepriceDialog.tsx"),
      "utf8",
    );
    expect(dialog).toContain("confirmApply");
    expect(dialog).toContain("retryApply");
    expect(dialog).not.toContain("applyBookingFinancialReprice(");
  });

  it("payments and amendments invalidate stale refreshes", () => {
    const root = join(__dirname, "..");
    const payments = readFileSync(
      join(
        root,
        "features/bookings/workspace/sections/BookingPaymentsSection.tsx",
      ),
      "utf8",
    );
    const amendments = readFileSync(
      join(
        root,
        "features/bookings/workspace/sections/BookingCommercialAmendmentsSection.tsx",
      ),
      "utf8",
    );
    expect(payments).toContain("loadRequestIdRef");
    expect(payments).toContain("refreshNonce");
    expect(amendments).toContain("loadRequestIdRef");
    expect(amendments).toContain("refreshNonce");
  });

  it("hook resets confirmation state on tenant switch", () => {
    const root = join(__dirname, "..");
    const hook = readFileSync(
      join(
        root,
        "features/bookings/workspace/hooks/useBookingFinancialReprice.ts",
      ),
      "utf8",
    );
    expect(hook).toContain("[bookingId, tenantId, resetWorkflow]");
  });
});
