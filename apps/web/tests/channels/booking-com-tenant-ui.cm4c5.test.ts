import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOKING_COM_OPERATOR_PHASE_LABELS,
  deriveBookingComOperatorPhase,
} from "@/lib/channels/booking-com-operator-view";
import {
  getBookingComPartnerAccessStatus,
  isBookingComFixtureTransportEnabled,
} from "@/lib/channels/booking-com-operator-access";
import { buildBookingComLocalAriCells } from "@/lib/channels/booking-com-local-ari";
import {
  BOOKING_COM_HELP_SECTIONS,
  BOOKING_COM_SCREENSHOT_MANIFEST,
} from "@/features/channels/booking-com/help-content";
import { BOOKING_COM_WIZARD_STEPS } from "@/features/channels/booking-com/types";
import { adminNavItems } from "@/components/admin/admin-sidebar";

const ROOT = process.cwd();

describe("CM-4c-5 Booking.com tenant UI fitness", () => {
  it("keeps Channels in tenant nav", () => {
    expect(adminNavItems.some((i) => i.href === "/dashboard/channels")).toBe(true);
  });

  it("exposes Booking.com setup, dashboard routing, and help routes", () => {
    const paths = [
      ["app", "(dashboard)", "dashboard", "channels", "page.tsx"],
      ["app", "(dashboard)", "dashboard", "channels", "[connectionId]", "page.tsx"],
      ["app", "(dashboard)", "dashboard", "channels", "[connectionId]", "setup", "page.tsx"],
      ["app", "(dashboard)", "dashboard", "channels", "booking-com", "setup", "page.tsx"],
      ["app", "(dashboard)", "dashboard", "channels", "help", "page.tsx"],
      ["app", "(dashboard)", "dashboard", "channels", "help", "booking-com", "page.tsx"],
    ];
    for (const parts of paths) {
      expect(existsSync(join(ROOT, ...parts)), parts.join("/")).toBe(true);
    }
  });

  it("wizard has 10 steps and help sections cover the guide", () => {
    expect(BOOKING_COM_WIZARD_STEPS).toHaveLength(10);
    expect(BOOKING_COM_HELP_SECTIONS.length).toBeGreaterThanOrEqual(12);
    expect(BOOKING_COM_SCREENSHOT_MANIFEST).toHaveLength(14);
    expect(BOOKING_COM_SCREENSHOT_MANIFEST.every((s) => s.imageSrc === null)).toBe(
      true,
    );
  });

  it("partner access is never live by default; fixture blocked in production", () => {
    expect(
      isBookingComFixtureTransportEnabled({
        NODE_ENV: "production",
        CHANNELS_BOOKING_COM_FIXTURE_TRANSPORT: "true",
      }),
    ).toBe(false);
    const status = getBookingComPartnerAccessStatus({
      NODE_ENV: "development",
      CHANNELS_BOOKING_COM_FIXTURE_TRANSPORT: "false",
    });
    expect(status.liveConnectivityAvailable).toBe(false);
    expect(status.operatorMessage.toLowerCase()).toContain("partner");
  });

  it("derives operator phases without inventing a second state machine", () => {
    expect(
      deriveBookingComOperatorPhase({
        connectionStatus: "active",
        setup: {
          hotelId: "1",
          approvedConnectionTypes: ["Reservations", "AVAILABILITY"],
          pricingModel: "Standard",
          setupProgress: "ready_to_activate",
          mappingReady: true,
          initialSyncReady: true,
        },
        activeRoomMappings: 1,
        activeRateMappings: 1,
        activeRoomRateMappings: 1,
        hasPropertyMapping: true,
        liveConnectivityAvailable: false,
      }),
    ).toBe("connected");
    expect(BOOKING_COM_OPERATOR_PHASE_LABELS.awaiting_access).toMatch(/Awaiting/i);
  });

  it("local ARI projection is deterministic for preview fingerprints", () => {
    const a = buildBookingComLocalAriCells({
      hotelId: "8135188",
      rooms: [{ roomTypeId: "1000202", ratePlanId: "12345" }],
      from: "2026-10-01",
      to: "2026-10-02",
      roomsToSell: 2,
      price: 100,
    });
    const b = buildBookingComLocalAriCells({
      hotelId: "8135188",
      rooms: [{ roomTypeId: "1000202", ratePlanId: "12345" }],
      from: "2026-10-01",
      to: "2026-10-02",
      roomsToSell: 2,
      price: 100,
    });
    expect(a.talosStateFingerprint).toBe(b.talosStateFingerprint);
    expect(a.cells.length).toBeGreaterThan(0);
  });

  it("UI never exposes Booking.com secrets or router.refresh on mapping saves", () => {
    const wizard = readFileSync(
      join(ROOT, "features", "channels", "booking-com", "BookingComWizard.tsx"),
      "utf8",
    );
    expect(wizard).not.toMatch(/client_secret/);
    expect(wizard).not.toMatch(/router\.refresh\(/);
    expect(wizard).toMatch(/ContextualHelpLink/);
    expect(wizard).toMatch(/stale|configuration changed/i);

    const api = readFileSync(
      join(ROOT, "features", "channels", "booking-com", "booking-com-api.ts"),
      "utf8",
    );
    expect(api).not.toMatch(/client_secret/);
    expect(api).toMatch(/stale preview/i);

    const begin = readFileSync(
      join(
        ROOT,
        "app",
        "api",
        "admin",
        "v1",
        "channels",
        "booking-com",
        "begin-setup",
        "route.ts",
      ),
      "utf8",
    );
    expect(begin).toMatch(/Never accepts client_secret from the browser/);
    expect(begin).toMatch(/fixtureTransportEnabled/);

    const channelsPage = readFileSync(
      join(ROOT, "features", "channels", "ChannelsPage.tsx"),
      "utf8",
    );
    expect(channelsPage).toMatch(/BookingComProviderCard/);
    expect(channelsPage).toMatch(/ComingSoonProviderCard/);
    expect(channelsPage).toMatch(/iCal/);

    const providerCard = readFileSync(
      join(ROOT, "features", "channels", "booking-com", "BookingComProviderCard.tsx"),
      "utf8",
    );
    expect(providerCard).toMatch(/Coming later/);
  });

  it("iCal detail remains available and Booking.com dashboard is separate", () => {
    expect(
      existsSync(join(ROOT, "features", "channels", "IcalChannelDetailPage.tsx")),
    ).toBe(true);
    const detail = readFileSync(
      join(ROOT, "features", "channels", "ChannelDetailPage.tsx"),
      "utf8",
    );
    expect(detail).toMatch(/BookingComConnectedDashboard/);
    expect(detail).toMatch(/IcalChannelDetailPage/);
  });

  it("screenshot placeholders never fabricate Booking.com UI assets", () => {
    const slot = readFileSync(
      join(ROOT, "features", "channels", "booking-com", "ScreenshotSlot.tsx"),
      "utf8",
    );
    expect(slot).toMatch(/will be added after test Extranet access/);
  });
});
