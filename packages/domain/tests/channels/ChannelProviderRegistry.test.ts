import { describe, it, expect } from "vitest";
import type { ChannelProviderRegistration } from "../../src/channels/ports/providers/ChannelProviderRegistration";
import { withDefaultProviderRegistrationPolicies } from "../../src/channels/ports/providers/ChannelProviderRegistration";
import type { IChannelAvailabilityExportProvider } from "../../src/channels/ports/providers/IChannelAvailabilityExportProvider";
import type { IChannelConnectionAuthProvider } from "../../src/channels/ports/providers/IChannelConnectionAuthProvider";
import type { IChannelPollingProvider } from "../../src/channels/ports/providers/IChannelPollingProvider";
import type { IChannelRateRestrictionExportProvider } from "../../src/channels/ports/providers/IChannelRateRestrictionExportProvider";
import type { IChannelReservationExportProvider } from "../../src/channels/ports/providers/IChannelReservationExportProvider";
import type { ChannelReservationImportContext } from "../../src/channels/ports/providers/IChannelReservationImportProvider";
import type { IChannelReservationImportProvider } from "../../src/channels/ports/providers/IChannelReservationImportProvider";
import type { IChannelWebhookProvider } from "../../src/channels/ports/providers/IChannelWebhookProvider";
import {
  API_CHANNEL_CORE_CAPABILITIES,
  API_CHANNEL_INBOUND_CAPABILITIES,
  createProviderCapabilities,
  ICAL_PROVIDER_CAPABILITIES,
} from "../../src/channels/types/ChannelCapabilities";
import type { ChannelProviderMessage } from "../../src/channels/types/ChannelProviderMessage";
import type { ChannelReservationImportMapping } from "../../src/channels/types/ChannelReservationImportMapping";
import { ChannelProviderRegistrationError } from "../../src/channels/errors/ChannelProviderRegistrationError";
import {
  ChannelProviderRegistry,
  validateChannelProviderRegistration,
} from "../../src/channels/providers/ChannelProviderRegistry";

const availabilityExport: IChannelAvailabilityExportProvider = {
  publishAvailability: async () => ({ success: true }),
};

const rateRestrictionExport: IChannelRateRestrictionExportProvider = {
  publishRates: async () => ({ success: true }),
  publishRestrictions: async () => ({ success: true }),
};

const reservationImport: IChannelReservationImportProvider = {
  mapMessage: async (
    message: ChannelProviderMessage,
    _context: ChannelReservationImportContext,
  ): Promise<ChannelReservationImportMapping> => {
    if (message.kind === "reservation.modify") {
      return {
        kind: "modify",
        mapping: {
          externalReference: { source: "booking_com", externalId: "ext-1" },
          connectionId: message.connectionId,
          proposed: {
            unitId: "unit-1",
            checkIn: "2027-08-01",
            checkOut: "2027-08-05",
            guestCount: 2,
          },
          idempotencyKey: "modify-key",
        },
      };
    }
    if (message.kind === "reservation.cancel") {
      return {
        kind: "cancel",
        mapping: {
          externalReference: { source: "booking_com", externalId: "ext-1" },
          connectionId: message.connectionId,
          idempotencyKey: "cancel-key",
        },
      };
    }
    return {
      kind: "create",
      command: {
        tenantId: "tenant-1",
        propertyId: "property-1",
        unitId: "unit-1",
        checkIn: "2027-08-01",
        checkOut: "2027-08-05",
        guestCount: 2,
        guest: { name: "Guest", email: "guest@example.com", phone: null },
        source: "booking_com",
        externalReference: { source: "booking_com", externalId: "ext-1" },
      },
    };
  },
};

const webhooks: IChannelWebhookProvider = {
  verify: async (_request, _context) => ({ accepted: true, connectionId: "conn-1" }),
  parse: async () => [],
};

const polling: IChannelPollingProvider = {
  poll: async (_connectionId, _cursor, _context) => ({ messages: [], nextCursor: null }),
};

const auth: IChannelConnectionAuthProvider = {
  initiateAuth: async () => ({ redirectUrl: "https://example.com/oauth" }),
  validateConnection: async () => ({ status: "valid" }),
};

const reservationExport: IChannelReservationExportProvider = {
  exportChange: async () => ({ success: true }),
};

function apiRegistration(
  overrides: Partial<ChannelProviderRegistration> = {},
): ChannelProviderRegistration {
  return withDefaultProviderRegistrationPolicies({
    providerId: "booking_com",
    capabilities: createProviderCapabilities({
      core: API_CHANNEL_CORE_CAPABILITIES,
      inbound: API_CHANNEL_INBOUND_CAPABILITIES,
      connectionAuth: true,
    }),
    status: "active",
    auth,
    webhooks,
    polling,
    reservationImport,
    availabilityExport,
    rateRestrictionExport,
    reservationExport: null,
    ...overrides,
  });
}

describe("ChannelProviderRegistry", () => {
  it("registers a valid API-style bundle with core and inbound providers", () => {
    const registry = new ChannelProviderRegistry();
    registry.register(apiRegistration());

    expect(registry.resolveAvailabilityExport("booking_com")).toBe(availabilityExport);
    expect(registry.resolveReservationImport("booking_com")).toBe(reservationImport);
    expect(registry.resolveWebhooks("booking_com")).toBe(webhooks);
    expect(registry.resolveReservationExport("booking_com")).toBeNull();
  });

  it("resolves optional reservation export when capability is enabled", () => {
    const registry = new ChannelProviderRegistry();
    registry.register(
      apiRegistration({
        capabilities: createProviderCapabilities({
          core: API_CHANNEL_CORE_CAPABILITIES,
          inbound: API_CHANNEL_INBOUND_CAPABILITIES,
          optional: {
            reservationExport: true,
            reservationExportOperations: ["modify", "cancel"],
          },
          connectionAuth: true,
        }),
        reservationExport,
      }),
    );

    expect(registry.resolveReservationExport("booking_com")).toBe(reservationExport);
    expect(registry.get("booking_com")?.capabilities.optional.reservationExportOperations).toEqual([
      "modify",
      "cancel",
    ]);
  });

  it("registers iCal MVP preset with polling only", () => {
    const registry = new ChannelProviderRegistry();
    registry.register(
      withDefaultProviderRegistrationPolicies({
        providerId: "ical",
        capabilities: ICAL_PROVIDER_CAPABILITIES,
        status: "active",
        auth: null,
        webhooks: null,
        polling,
        reservationImport: null,
        availabilityExport: null,
        rateRestrictionExport: null,
        reservationExport: null,
      }),
    );

    expect(registry.resolveWebhooks("ical")).toBeNull();
    expect(registry.resolvePolling("ical")).toBe(polling);
    expect(registry.resolveReservationImport("ical")).toBeNull();
    expect(registry.resolveAvailabilityExport("ical")).toBeNull();
    expect(registry.resolveRateRestrictionExport("ical")).toBeNull();
    expect(registry.resolveReservationExport("ical")).toBeNull();
  });

  it("throws when capability and provider implementation mismatch", () => {
    expect(() =>
      validateChannelProviderRegistration(
        apiRegistration({
          capabilities: createProviderCapabilities({
            core: { ...API_CHANNEL_CORE_CAPABILITIES, availabilityExport: true },
            inbound: API_CHANNEL_INBOUND_CAPABILITIES,
            connectionAuth: true,
          }),
          availabilityExport: null,
        }),
      ),
    ).toThrow(ChannelProviderRegistrationError);
  });

  it("throws on duplicate provider registration", () => {
    const registry = new ChannelProviderRegistry();
    registry.register(apiRegistration());
    expect(() => registry.register(apiRegistration())).toThrow(ChannelProviderRegistrationError);
  });

  it("returns null for unknown providers", () => {
    const registry = new ChannelProviderRegistry();
    expect(registry.get("airbnb")).toBeNull();
    expect(registry.resolveAvailabilityExport("airbnb")).toBeNull();
  });

  it("returns null from resolve methods when capability is disabled", () => {
    const registry = new ChannelProviderRegistry();
    registry.register(
      withDefaultProviderRegistrationPolicies({
        providerId: "ical",
        capabilities: ICAL_PROVIDER_CAPABILITIES,
        status: "active",
        auth: null,
        webhooks: null,
        polling,
        reservationImport: null,
        availabilityExport: null,
        rateRestrictionExport: null,
        reservationExport: null,
      }),
    );

    expect(registry.resolveWebhooks("ical")).toBeNull();
    expect(registry.resolveReservationImport("ical")).toBeNull();
    expect(registry.resolveAvailabilityExport("ical")).toBeNull();
    expect(registry.resolveRateRestrictionExport("ical")).toBeNull();
  });

  it("lists all registered providers", () => {
    const registry = new ChannelProviderRegistry();
    registry.register(apiRegistration());
    registry.register(
      withDefaultProviderRegistrationPolicies({
        providerId: "ical",
        capabilities: ICAL_PROVIDER_CAPABILITIES,
        status: "active",
        auth: null,
        webhooks: null,
        polling,
        reservationImport: null,
        availabilityExport: null,
        rateRestrictionExport: null,
        reservationExport: null,
      }),
    );

    expect(registry.list()).toHaveLength(2);
    expect(registry.list().map((entry) => entry.providerId).sort()).toEqual(["booking_com", "ical"]);
  });

  it("maps provider messages to import mapping kinds without credential material", () => {
    const messageBase: ChannelProviderMessage = {
      messageId: "msg-1",
      kind: "reservation.create",
      receivedAt: new Date("2027-01-01T00:00:00.000Z"),
      connectionId: "conn-1",
      provider: "booking_com",
      payload: { reservationId: "ext-1" },
    };

    const importContext = {
      tenantId: "tenant-1",
      connectionId: "conn-1",
      propertyId: "property-1",
      unitId: "unit-1",
    };

    return reservationImport.mapMessage(messageBase, importContext).then((createResult) => {
      expect(createResult.kind).toBe("create");
      expect(JSON.stringify(createResult)).not.toMatch(/token|secret|api_key/i);

      return reservationImport.mapMessage(
        {
          ...messageBase,
          kind: "reservation.modify",
        },
        importContext,
      );
    }).then((modifyResult) => {
      expect(modifyResult.kind).toBe("modify");

      return reservationImport.mapMessage(
        {
          ...messageBase,
          kind: "reservation.cancel",
        },
        importContext,
      );
    }).then((cancelResult) => {
      expect(cancelResult.kind).toBe("cancel");
    });
  });
});

describe("createProviderCapabilities", () => {
  it("defaults optional reservation export to disabled", () => {
    const caps = createProviderCapabilities({});
    expect(caps.optional.reservationExport).toBe(false);
    expect(caps.optional.reservationExportOperations).toEqual([]);
  });
});
