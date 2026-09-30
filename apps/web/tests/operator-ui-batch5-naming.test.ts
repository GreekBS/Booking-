import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Batch 5 — operator naming + localization presentation", () => {
  it("resolves breadcrumb UUID segments via entity labels and property catalog", () => {
    const crumbs = read("components/admin/admin-breadcrumbs.tsx");
    expect(crumbs).toContain("useBreadcrumbEntityLabelsContext");
    expect(crumbs).toContain("propertyNameById");
    expect(crumbs).toContain("assistant: elCommon.aiAssistant");
    expect(crumbs).toContain("STATIC_SEGMENT_LABELS");
    expect(crumbs).not.toMatch(/segment\.slice\(0,\s*8\)/);

    const provider = read("components/admin/breadcrumb-entity-labels.tsx");
    expect(provider).toContain("BreadcrumbEntityLabelsProvider");
    expect(provider).toContain("useBreadcrumbEntityLabels");

    const shell = read("components/admin/admin-shell.tsx");
    expect(shell).toContain("BreadcrumbEntityLabelsProvider");

    const property = read("features/properties/PropertyDetailPage.tsx");
    expect(property).toContain("useBreadcrumbEntityLabels");
    expect(property).toContain("elCommon.aiAssistant");
    expect(property).toContain("elCommon.archive");

    const guest = read("features/guests/GuestProfilePage.tsx");
    expect(guest).toContain("useBreadcrumbEntityLabels");
    expect(guest).toContain("displayName");

    const assistant = read("features/messaging/PropertyAiAssistantPage.tsx");
    expect(assistant).toContain("useBreadcrumbEntityLabels");
    expect(assistant).toContain("elCommon.aiAssistant");
    expect(assistant).not.toContain("AI Guest Receptionist");
  });

  it("shows human-readable unit names in booking list and stay section", () => {
    const bookings = read("features/bookings/BookingsPage.tsx");
    expect(bookings).toContain("displayUnitName(unit?.name)");
    expect(bookings).toContain("displayUnitName(u.name)");

    const stay = read(
      "features/bookings/workspace/sections/BookingStaySection.tsx",
    );
    expect(stay).toContain("displayUnitName");
    expect(stay).toContain("resolvedUnitLabel");
    expect(stay).not.toContain("unitId.slice(0, 8)");
  });

  it("replaces known English leftovers on audited operator surfaces", () => {
    const properties = read("features/properties/PropertiesPage.tsx");
    expect(properties).toContain("elCommon.addProperty");
    expect(properties).not.toContain("Add property");

    const settings = read("features/settings/SettingsPage.tsx");
    expect(settings).toContain("Οργανισμός");
    expect(settings).toContain("Περιφέρεια");
    expect(settings).toContain("Εμπόριο");
    expect(settings).not.toContain(">Organization<");
    expect(settings).not.toContain(">Regional<");

    const channels = read("features/channels/ChannelsPage.tsx");
    expect(channels).toContain("elCommon.available");
    expect(channels).toContain("elCommon.connected");
    expect(channels).not.toContain('"Available"');

    const messaging = read(
      "features/messaging/PropertyWhatsAppAutomationsPanel.tsx",
    );
    expect(messaging).toContain("elCommon.guestMessaging");
    expect(messaging).not.toContain('title="Guest Messaging"');

    const bookingMsg = read(
      "features/bookings/workspace/sections/BookingWhatsAppMessagingSection.tsx",
    );
    expect(bookingMsg).toContain("elCommon.guestMessaging");

    const pricing = read("features/pricing/PricingPage.tsx");
    expect(pricing).toContain("elCommon.add");
    expect(pricing).not.toMatch(/>\s*Add\s*</);

    const access = read("lib/channels/booking-com-operator-access.ts");
    expect(access).toContain("Booking.com");
    expect(access).toContain("partner");
    expect(access).not.toContain(
      "Booking.com connectivity is being prepared for partner activation",
    );
  });
});
