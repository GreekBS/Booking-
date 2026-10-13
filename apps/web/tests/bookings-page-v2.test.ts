import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bookingStatusCountsQuerySchema,
  listBookingsQuerySchema,
} from "@hcp/validators";
import {
  countActiveBookingFilters,
  EMPTY_BOOKING_FILTERS,
} from "@/features/bookings/BookingFiltersSheet";
import { bookingStatusPluralLabelEl, statusLabelEl } from "@/lib/i18n";

const root = join(__dirname, "..");
const repoRoot = join(__dirname, "../../..");

function readWeb(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("Bookings page V2 — validators & counts API", () => {
  it("accepts payment_pending and excludeSuperseded on list query", () => {
    const parsed = listBookingsQuerySchema.parse({
      page: "1",
      limit: "15",
      status: "payment_pending",
      excludeSuperseded: "true",
      createdAtFrom: "2026-01-01",
      createdAtTo: "2026-12-31",
    });
    expect(parsed.status).toBe("payment_pending");
    expect(parsed.excludeSuperseded).toBe(true);
    expect(parsed.createdAtFrom).toBe("2026-01-01");
    expect(parsed.sortBy).toBe("checkIn");
    expect(parsed.sortDir).toBe("desc");
  });

  it("parses status-counts query without status facet", () => {
    const parsed = bookingStatusCountsQuerySchema.parse({
      propertyId: "550e8400-e29b-41d4-a716-446655440000",
      excludeSuperseded: "true",
      guestSearch: "Maria",
    });
    expect(parsed.propertyId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(parsed.excludeSuperseded).toBe(true);
    expect(parsed.guestSearch).toBe("Maria");
    expect("status" in parsed).toBe(false);
  });

  it("repository builds superseded exclusion and status groupBy", () => {
    const repo = readRepo(
      "packages/database/src/repositories/commerce/BookingRepository.ts",
    );
    expect(repo).toContain("excludeSuperseded");
    expect(repo).toContain("supersededAt = null");
    expect(repo).toContain("async countByStatus");
    expect(repo).toContain('groupBy({');
    expect(repo).toContain('by: ["status"]');
  });

  it("exposes status-counts admin route", () => {
    const route = readWeb("app/api/admin/v1/bookings/status-counts/route.ts");
    expect(route).toContain("countBookingsByStatusUseCase");
    expect(route).toContain("excludeSuperseded: query.excludeSuperseded ?? true");
  });
});

describe("Bookings page V2 — status tabs & filters UX", () => {
  it("uses plural Greek labels and internal confirmed/completed values", () => {
    expect(bookingStatusPluralLabelEl("confirmed")).toBe("Ενεργές");
    expect(bookingStatusPluralLabelEl("completed")).toBe("Ολοκληρωμένες");
    expect(bookingStatusPluralLabelEl("cancelled")).toBe("Ακυρωμένες");
    expect(statusLabelEl("confirmed")).toBe("Ενεργή");
    expect(statusLabelEl("completed")).toBe("Ολοκληρωμένη");

    const tabs = readWeb("features/bookings/BookingStatusTabs.tsx");
    expect(tabs).toContain('id: "confirmed"');
    expect(tabs).toContain('id: "completed"');
    expect(tabs).toContain('tone: "info"');
    expect(tabs).toContain('tone: "success"');
  });

  it("counts advanced filters and supports clear/apply sheet", () => {
    expect(countActiveBookingFilters(EMPTY_BOOKING_FILTERS)).toBe(0);
    expect(
      countActiveBookingFilters({
        ...EMPTY_BOOKING_FILTERS,
        unitId: "u1",
        checkInFrom: "2026-10-01",
        registeredTo: "2026-10-31",
      }),
    ).toBe(3);

    const sheet = readWeb("features/bookings/BookingFiltersSheet.tsx");
    expect(sheet).toContain("Εφαρμογή φίλτρων");
    expect(sheet).toContain("Καθαρισμός");
    expect(sheet).toContain("Ημ. καταχώρησης");
    expect(sheet).not.toContain("original booking date");
  });

  it("BookingsPage wires tabs, filters URL, pagination scroll, and excludeSuperseded", () => {
    const page = readWeb("features/bookings/BookingsPage.tsx");
    expect(page).toContain("BookingStatusTabs");
    expect(page).toContain("BookingFiltersSheet");
    expect(page).toContain("excludeSuperseded: true");
    expect(page).toContain("fetchBookingStatusCounts");
    expect(page).toContain("scrollIntoView");
    expect(page).toContain("prefers-reduced-motion");
    expect(page).toContain("tableTopRef");
    expect(page).toContain("pageTransitioning");
    expect(page).toContain('params.set("status"');
    expect(page).toContain('params.set("page"');
    expect(page).toContain("elCommon.registeredAt");
    expect(page).toContain('useState<SortKey>("checkIn")');
    expect(page).toContain("νεότερη άφιξη πρώτα");
  });

  it("Pagination disables mid-transition and uses Greek labels", () => {
    const pagination = readWeb("components/admin/pagination.tsx");
    expect(pagination).toContain("disabled");
    expect(pagination).toContain("Προηγούμενη");
    expect(pagination).toContain("Επόμενη");
    expect(pagination).toContain("Σελίδα");
  });
});

describe("Bookings page V2 — no bookedAt scope", () => {
  it("does not introduce bookedAt / channelCreatedAt on Booking schema", () => {
    const schema = readRepo("packages/database/prisma/schema.prisma");
    const bookingBlock = schema.slice(
      schema.indexOf("model Booking {"),
      schema.indexOf("@@map(\"bookings\")"),
    );
    expect(bookingBlock).toContain("createdAt");
    expect(bookingBlock).not.toContain("bookedAt");
    expect(bookingBlock).not.toContain("channelCreatedAt");
    expect(bookingBlock).not.toContain("externalCreatedAt");
  });

  it("default list ordering is checkIn DESC at schema and page", () => {
    expect(listBookingsQuerySchema.parse({ page: 1, limit: 15 }).sortBy).toBe(
      "checkIn",
    );
    expect(listBookingsQuerySchema.parse({ page: 1, limit: 15 }).sortDir).toBe(
      "desc",
    );
    const page = readWeb("features/bookings/BookingsPage.tsx");
    expect(page).toContain('useState<SortKey>("checkIn")');
    expect(page).toContain('useState<SortDirection>("desc")');
  });
});
