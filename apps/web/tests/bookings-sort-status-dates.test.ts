import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listBookingsQuerySchema } from "@hcp/validators";
import {
  extractOperatorDateOnly,
  formatOperatorDate,
  formatOperatorDateOnly,
  formatOperatorDateTime,
  formatOperatorStayRange,
} from "@/lib/admin/money-presentation";
import { formatPlatformDate } from "@/lib/platform/format";
import {
  bookingStatusPluralLabelEl,
  statusLabelEl,
} from "@/lib/i18n";

const root = join(__dirname, "..");
const repoRoot = join(__dirname, "../../..");

function readWeb(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("Bookings list — check-in descending default sort", () => {
  it("defaults sortBy=checkIn and sortDir=desc at the query schema", () => {
    const parsed = listBookingsQuerySchema.parse({ page: 1, limit: 20 });
    expect(parsed.sortBy).toBe("checkIn");
    expect(parsed.sortDir).toBe("desc");
  });

  it("preserves explicit operator sort overrides including createdAt", () => {
    const byCreated = listBookingsQuerySchema.parse({
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortDir: "asc",
    });
    expect(byCreated.sortBy).toBe("createdAt");
    expect(byCreated.sortDir).toBe("asc");
  });

  it("repository applies primary + deterministic id secondary orderBy", () => {
    const repo = readRepo(
      "packages/database/src/repositories/commerce/BookingRepository.ts",
    );
    expect(repo).toContain("{ [orderByField]: filters.sortDir }");
    expect(repo).toContain("{ id: filters.sortDir }");
  });

  it("BookingsPage defaults to checkIn DESC and maps guest → guestName", () => {
    const page = readWeb("features/bookings/BookingsPage.tsx");
    expect(page).toContain('useState<SortKey>("checkIn")');
    expect(page).toContain('useState<SortDirection>("desc")');
    expect(page).toContain('sortKey === "guest" ? "guestName" : sortKey');
    expect(page).toContain("formatOperatorDateOnly(booking.checkIn)");
    expect(page).toContain("νεότερη άφιξη πρώτα");
  });

  it("past and future check-ins share one descending chronology (no today split)", () => {
    const page = readWeb("features/bookings/BookingsPage.tsx");
    expect(page).toContain("ανεξάρτητα από παρελθόν/μέλλον");
    expect(page).not.toContain("upcoming arrivals");
    expect(page).not.toContain("bookedAt");
  });

  it("serializeBooking still exposes createdAt for the registration column", () => {
    const ser = readWeb("lib/tenant-context.ts");
    expect(ser).toContain("booking.createdAt instanceof Date");
    expect(ser).toContain("booking.createdAt.toISOString()");
  });
});

describe("Booking status — confirmed ACTIVE blue / completed GREEN", () => {
  it("Greek singular and plural labels", () => {
    expect(statusLabelEl("confirmed")).toBe("Ενεργή");
    expect(statusLabelEl("CONFIRMED")).toBe("Ενεργή");
    expect(statusLabelEl("completed")).toBe("Ολοκληρωμένη");
    expect(bookingStatusPluralLabelEl("confirmed")).toBe("Ενεργές");
    expect(bookingStatusPluralLabelEl("completed")).toBe("Ολοκληρωμένες");
  });

  it("does not rename confirmation CTA copy to the status label", () => {
    const el = readWeb("lib/i18n/el.ts");
    expect(el).toContain('confirmed: "Ενεργή"');
    expect(el).not.toMatch(/confirmed:\s*"Επιβεβαιωμένη"/);
  });

  it("StatusBadge maps confirmed→info (blue) and completed→success (green)", () => {
    const badge = readWeb("components/admin/status-badge.tsx");
    expect(badge).toMatch(/confirmed:\s*"info"/);
    expect(badge).toMatch(/completed:\s*"success"/);
    expect(badge).not.toMatch(/confirmed:\s*"success"/);
    expect(badge).not.toMatch(/completed:\s*"outline"/);
  });

  it("Badge info/success tokens remain distinct (blue vs green)", () => {
    const ui = readWeb("components/ui/badge.tsx");
    expect(ui).toContain('info: "border-transparent bg-info-subtle text-info"');
    expect(ui).toContain(
      'success: "border-transparent bg-success-subtle text-success"',
    );
    const css = readWeb("app/globals.css");
    expect(css).toMatch(/--info:\s*205/);
    expect(css).toMatch(/--success:\s*152/);
  });

  it("status filters keep internal confirmed/completed values", () => {
    const page = readWeb("features/bookings/BookingsPage.tsx");
    const tabs = readWeb("features/bookings/BookingStatusTabs.tsx");
    expect(tabs).toContain("VISIBLE_BOOKING_STATUS_TABS");
    expect(tabs).toContain('tone: "info"');
    expect(tabs).toContain("toneIdle");
    expect(tabs).toContain("bg-info-subtle text-info");
    expect(tabs).toContain("bg-success-subtle text-success");
    expect(page).toContain("statusTabToListParam");
    expect(page).toContain('params.set("status", statusTab)');
  });

  it("import conflict lowercase status copy uses ενεργή", () => {
    const errors = readWeb(
      "features/reservation-import/reservation-import-errors.ts",
    );
    expect(errors).toContain('return "ενεργή"');
    expect(errors).not.toContain('return "επιβεβαιωμένη"');
  });
});

describe("Operator dates — DD/MM/YYYY display only", () => {
  it("formats date-only with leading zeros without Date parsing", () => {
    expect(formatOperatorDateOnly("2026-10-13")).toBe("13/10/2026");
    expect(formatOperatorDateOnly("2026-09-01")).toBe("01/09/2026");
    expect(formatOperatorDateOnly("2026-12-25")).toBe("25/12/2026");
  });

  it("extracts YYYY-MM-DD prefix from ISO datetimes without shifting the calendar day", () => {
    expect(extractOperatorDateOnly("2026-10-13T00:00:00.000Z")).toBe(
      "2026-10-13",
    );
    expect(extractOperatorDateOnly("2026-10-13T23:30:00.000Z")).toBe(
      "2026-10-13",
    );
    expect(formatOperatorDateOnly("2026-10-13T00:00:00.000Z")).toBe(
      "13/10/2026",
    );
  });

  it("formats stay ranges consistently", () => {
    expect(formatOperatorStayRange("2026-09-01", "2026-09-05")).toBe(
      "01/09/2026 → 05/09/2026",
    );
  });

  it("formatOperatorDate keeps date-only semantics for pure YYYY-MM-DD", () => {
    expect(formatOperatorDate("2026-01-02")).toBe("02/01/2026");
    expect(formatOperatorDate(null)).toBe("—");
  });

  it("central helpers are wired into key operator screens", () => {
    expect(readWeb("features/bookings/workspace/BookingWorkspaceHeader.tsx")).toContain(
      "formatOperatorDateOnly",
    );
    expect(readWeb("features/dashboard/DashboardOverview.tsx")).toContain(
      "formatOperatorStayRange",
    );
    expect(readWeb("features/guests/GuestProfilePage.tsx")).toContain(
      "formatOperatorDateOnly",
    );
    expect(
      readWeb("features/reservation-import/reservation-import-review-utils.ts"),
    ).toContain("formatOperatorStayRange");
    expect(readWeb("features/fiscal/FiscalDocumentsPage.tsx")).toContain(
      "formatOperatorDate",
    );
  });

  it("consistency pass wires messaging, housekeeping, channels, and hold expiry", () => {
    expect(readWeb("features/messaging/MessagesPage.tsx")).toContain(
      "formatOperatorDateTime",
    );
    expect(readWeb("features/housekeeping/HousekeepingPage.tsx")).toContain(
      "formatOperatorDateTime",
    );
    expect(
      readWeb("features/bookings/workspace/sections/BookingOperationsTasksSection.tsx"),
    ).toContain("formatOperatorDate");
    expect(readWeb("features/channels/IcalChannelDetailPage.tsx")).toContain(
      "formatOperatorDateTime",
    );
    expect(
      readWeb("features/channels/booking-com/BookingComConnectedDashboard.tsx"),
    ).toContain("formatOperatorDateTime");
    expect(readWeb("features/cleaning/UnitQrSheet.tsx")).toContain(
      "formatOperatorDateTime",
    );
    expect(
      readWeb("features/availability/components/drawers/HoldDetailDrawer.tsx"),
    ).toContain("formatOperatorDateTime");
    expect(
      readWeb("features/extranet-calendar/components/workspace-panels/HoldWorkspacePanel.tsx"),
    ).toContain("formatOperatorDateTime");
    expect(readWeb("lib/platform/format.ts")).toContain("formatOperatorDateTime");
  });

  it("formatOperatorDateTime preserves local time with DD/MM/YYYY date part", () => {
    const formatted = formatOperatorDateTime("2026-10-13T15:45:00.000");
    expect(formatted).toMatch(/^\d{2}\/\d{2}\/2026, \d{2}:\d{2}$/);
    expect(formatted.startsWith("13/10/2026")).toBe(true);
  });

  it("formatPlatformDate delegates to shared datetime formatting", () => {
    const formatted = formatPlatformDate("2026-09-01T09:05:00.000");
    expect(formatted.startsWith("01/09/2026")).toBe(true);
    expect(formatPlatformDate(null)).toBe("—");
  });

  it("does not reverse dates via unsafe string split of display values in helpers", () => {
    const money = readWeb("lib/admin/money-presentation.ts");
    expect(money).toContain("extractOperatorDateOnly");
    expect(money).toMatch(/\$\{d\}\/\$\{m\}\/\$\{y\}/);
    expect(money).not.toContain(".split('/').reverse()");
  });

  it("intentional exceptions remain (calendar chrome + machine ISO ranges)", () => {
    expect(readWeb("features/availability/lib/calendar-utils.ts")).toContain(
      "toLocaleDateString",
    );
    expect(readWeb("features/extranet-calendar/lib/month-grid-model.ts")).toContain(
      "toLocaleDateString",
    );
    // Machine-readable API range builders — not display.
    expect(
      readWeb("features/channels/booking-com/BookingComConnectedDashboard.tsx"),
    ).toContain("toISOString().slice(0, 10)");
  });
});
