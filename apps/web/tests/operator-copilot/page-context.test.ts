import { describe, expect, it } from "vitest";
import { derivePageContext } from "@/features/operator-copilot/lib/page-context";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";

describe("derivePageContext", () => {
  it.each([
    ["/dashboard", "dashboard"],
    ["/dashboard/", "dashboard"],
    ["/dashboard/availability", "calendar"],
    ["/dashboard/bookings", "booking"],
    ["/dashboard/bookings/new", "booking"],
    ["/dashboard/messages", "messages"],
    ["/dashboard/housekeeping", "housekeeping"],
    ["/dashboard/housekeeping/history", "housekeeping"],
    ["/dashboard/guests", "generic"],
    ["/something-else", "generic"],
  ])("maps %s to %s", (pathname, kind) => {
    expect(derivePageContext(pathname).kind).toBe(kind);
  });

  it("handles missing pathnames", () => {
    expect(derivePageContext(null)).toEqual({ kind: "generic" });
    expect(derivePageContext(undefined)).toEqual({ kind: "generic" });
  });

  it("extracts a booking id from a booking route only when it is a UUID", () => {
    expect(derivePageContext(`/dashboard/bookings/${UUID}`)).toEqual({
      kind: "booking",
      bookingId: UUID,
    });
    expect(derivePageContext("/dashboard/bookings/import")).toEqual({ kind: "booking" });
  });

  it("merges valid hints and drops invalid values", () => {
    const ctx = derivePageContext("/dashboard/availability", {
      propertyId: UUID,
      unitId: UUID_2,
      dateFrom: "2026-10-01",
      dateTo: "not-a-date",
      bookingId: "'; DROP TABLE bookings;--",
    });
    expect(ctx).toEqual({
      kind: "calendar",
      propertyId: UUID,
      unitId: UUID_2,
      dateFrom: "2026-10-01",
    });
  });

  it("lets a page override the derived kind with a known kind only", () => {
    expect(derivePageContext("/dashboard/guests", { kind: "messages" }).kind).toBe("messages");
    expect(
      derivePageContext("/dashboard/guests", { kind: "admin" as never }).kind,
    ).toBe("generic");
  });

  it("never emits identity fields", () => {
    const ctx = derivePageContext("/dashboard", {
      propertyId: UUID,
      tenantId: "t",
      userId: "u",
      role: "super_admin",
    } as never);
    expect(Object.keys(ctx).sort()).toEqual(["kind", "propertyId"]);
  });
});
