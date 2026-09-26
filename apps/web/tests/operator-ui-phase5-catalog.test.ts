import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  channelProviderLabel,
  channelStatusLabel,
  memberRoleLabel,
} from "@/lib/admin/operator-labels";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Talos operator Phase 5 — Channels / Property / Administration", () => {
  it("Channels hub is a distribution workspace with Active Property relevance", () => {
    const page = read("features/channels/ChannelsPage.tsx");
    expect(page).toContain("PageHeader");
    expect(page).toContain("Surface");
    expect(page).toContain("StatusBadge");
    expect(page).toContain("useActiveProperty");
    expect(page).toContain("renderActivePropertyGate");
    expect(page).toContain("channelStatusLabel");
    expect(page).toContain("channelProviderLabel");
    expect(page).toContain("Distribution");
    expect(page).toContain("/dashboard/channels/help");
    expect(page).toContain("ComingSoonProviderCard");
    expect(page).not.toContain("perf-diag");
    expect(page).not.toContain("<h1");

    const soon = read("features/channels/booking-com/BookingComProviderCard.tsx");
    expect(soon).toContain("Coming soon");
  });

  it("iCal detail is operator-oriented with advanced diagnostics collapsed", () => {
    const page = read("features/channels/IcalChannelDetailPage.tsx");
    expect(page).toContain("PageHeader");
    expect(page).toContain("Surface");
    expect(page).toContain("StatusBadge");
    expect(page).toContain("Mapped unit");
    expect(page).toContain("Inventory synchronization");
    expect(page).toContain("Advanced diagnostics");
    expect(page).toContain("Refresh feed now");
    expect(page).toContain("Defaults to Active Property");
    expect(page).not.toContain("CHANNELS_INVENTORY_APPLY_ENABLED");
    expect(page).not.toContain("CHANNELS_POLLING_ENABLED");
    expect(page).not.toContain("Trigger manual poll");
    expect(page).not.toContain("channel_import");
    expect(page).not.toContain("perf-diag");
  });

  it("Booking.com provider card and connected dashboard use Talos surfaces", () => {
    const card = read("features/channels/booking-com/BookingComProviderCard.tsx");
    expect(card).toContain("Surface");
    expect(card).toContain("StatusBadge");
    expect(card).toContain("Setup required");
    expect(card).toContain("Connected");

    const dash = read("features/channels/booking-com/BookingComConnectedDashboard.tsx");
    expect(dash).toContain("PageHeader");
    expect(dash).toContain("Surface");
    expect(dash).toContain("StatusBadge");
    expect(dash).toContain("channelStatusLabel");
    expect(dash).toContain("Property / listing mapping");
    expect(dash).not.toContain('from "@/components/ui/card"');
    expect(dash).not.toContain('from "@/components/ui/badge"');
    expect(dash).not.toContain("Connection looks healthy.");
  });

  it("Booking.com wizard and help use Surface presentation without Card walls", () => {
    const wizard = read("features/channels/booking-com/BookingComWizard.tsx");
    expect(wizard).toContain("PageHeader");
    expect(wizard).toContain("Surface");
    expect(wizard).toContain("StatusBadge");
    expect(wizard).toContain("useActiveProperty");
    expect(wizard).toContain("Mapping property");
    expect(wizard).not.toContain('from "@/components/ui/card"');
    expect(wizard).not.toContain('from "@/components/ui/badge"');

    const help = read("features/channels/booking-com/BookingComHelpPages.tsx");
    expect(help).toContain("PageHeader");
    expect(help).toContain("Surface");
    expect(help).not.toContain('from "@/components/ui/card"');
  });

  it("Properties list is tenant-wide; Units are Active Property scoped", () => {
    const properties = read("features/properties/PropertiesPage.tsx");
    expect(properties).toContain("PageHeader");
    expect(properties).toContain("Surface");
    expect(properties).toContain("renderTenantGate");
    expect(properties).not.toContain("useActiveProperty");
    expect(properties).not.toContain("renderActivePropertyGate");

    const detail = read("features/properties/PropertyDetailPage.tsx");
    expect(detail).toContain("PageHeader");
    expect(detail).toContain("Surface");

    const create = read("features/properties/CreatePropertyPage.tsx");
    expect(create).toContain("PageHeader");
    expect(create).toContain("Surface");

    const units = read("features/units/UnitsPage.tsx");
    expect(units).toContain("useActiveProperty");
    expect(units).toContain("renderActivePropertyGate");
    expect(units).toContain("PageHeader");
    expect(units).toContain("Surface");
    expect(units).not.toContain('placeholder="Select property"');
  });

  it("Amenities catalog is tenant-wide; Policies use Active Property without property picker", () => {
    const amenities = read("features/amenities/AmenitiesPage.tsx");
    expect(amenities).toContain("PageHeader");
    expect(amenities).toContain("catalog");
    expect(amenities).toContain("does not use Active Property");
    expect(amenities).not.toContain("useActiveProperty");

    const policies = read("features/policies/PoliciesPage.tsx");
    expect(policies).toContain("useActiveProperty");
    expect(policies).toContain("renderActivePropertyGate");
    expect(policies).toContain("PageHeader");
    expect(policies).toContain("Surface");
    expect(policies).not.toContain('placeholder="Select property"');
    expect(policies).not.toContain("onSelectedPropertyChange");
  });

  it("Guests is an honest booking-derived directory scoped to Active Property", () => {
    const guests = read("features/guests/GuestsPage.tsx");
    expect(guests).toContain("useActiveProperty");
    expect(guests).toContain("renderActivePropertyGate");
    expect(guests).toContain("PageHeader");
    expect(guests).toContain("not a CRM");
    expect(guests).toContain("fetchAllBookings");
    expect(guests).toContain("aggregateGuests");
    expect(guests).toContain("/dashboard/bookings");
    expect(guests).not.toContain("loyalty");
    expect(guests).not.toContain("lifetime value");
    expect(guests).not.toContain("marketing consent");
  });

  it("Members and Settings remain tenant-wide with Talos chrome", () => {
    const members = read("features/members/MembersPage.tsx");
    expect(members).toContain("PageHeader");
    expect(members).toContain("Surface");
    expect(members).not.toContain("useActiveProperty");
    expect(members).not.toContain("renderActivePropertyGate");

    const settings = read("features/settings/SettingsPage.tsx");
    expect(settings).toContain("PageHeader");
    expect(settings).toContain("Surface");
    expect(settings).toContain("Tabs");
    expect(settings).toContain("Organization");
    expect(settings).toContain("Fiscal");
    expect(settings).toContain("FiscalSettingsSection");
    expect(settings).not.toContain("useActiveProperty");
  });

  it("operator-labels map channel enums without renaming stored values", () => {
    expect(channelStatusLabel("active")).toBe("Connected");
    expect(channelStatusLabel("draft")).toBe("Setup required");
    expect(channelStatusLabel("pending_auth")).toBe("Setup required");
    expect(channelStatusLabel("paused")).toBe("Paused");
    expect(channelStatusLabel("error")).toBe("Attention");
    expect(channelProviderLabel("booking_com")).toBe("Booking.com");
    expect(channelProviderLabel("ical")).toBe("iCal");
    expect(memberRoleLabel("admin")).toBe("Admin");
    expect(memberRoleLabel("manager")).toBe("Manager");
  });

  it("Phase 5 surfaces never restore perf-diag", () => {
    const files = [
      "features/channels/ChannelsPage.tsx",
      "features/channels/IcalChannelDetailPage.tsx",
      "features/channels/booking-com/BookingComConnectedDashboard.tsx",
      "features/channels/booking-com/BookingComWizard.tsx",
      "features/properties/PropertiesPage.tsx",
      "features/units/UnitsPage.tsx",
      "features/guests/GuestsPage.tsx",
      "features/amenities/AmenitiesPage.tsx",
      "features/policies/PoliciesPage.tsx",
      "features/members/MembersPage.tsx",
      "features/settings/SettingsPage.tsx",
    ];
    for (const file of files) {
      expect(read(file)).not.toContain("perf-diag");
    }
  });
});
