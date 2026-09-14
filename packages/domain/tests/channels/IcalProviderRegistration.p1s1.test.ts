import { describe, expect, it } from "vitest";
import {
  ChannelProviderRegistrationError,
  ChannelProviderRegistry,
  ICAL_PROVIDER_CAPABILITIES,
  IcalPollingProvider,
  createIcalProviderRegistration,
  mayEmitReservationCreate,
  validateChannelProviderRegistration,
} from "../../src/channels";
import { withDefaultProviderRegistrationPolicies } from "../../src/channels/ports/providers/ChannelProviderRegistration";
import type { IChannelAvailabilityExportProvider } from "../../src/channels/ports/providers/IChannelAvailabilityExportProvider";
import type { IChannelReservationImportProvider } from "../../src/channels/ports/providers/IChannelReservationImportProvider";
import {
  assertFeedSemanticModeAllowed,
  isFeedSemanticModeAllowed,
  resolveAllowedFeedSemanticModes,
} from "../../src/channels/types/FeedSemanticModePolicy";
import { ValidationError } from "../../src/shared/errors/DomainError";
import { createTestIcalProviderRegistration } from "./ical/helpers/icalTestProvider";
import { encodeIcsCalendar } from "./ical/helpers/encodeIcsCalendar";
import { createStaticIcalFeedFetcher } from "./ical/helpers/mockIcalFeedFetcher";

describe("Provider-1 P1-S1 — ICAL_PROVIDER_CAPABILITIES", () => {
  it("matches the approved MVP capability truth table", () => {
    expect(ICAL_PROVIDER_CAPABILITIES.inbound.polling).toBe(true);
    expect(ICAL_PROVIDER_CAPABILITIES.inbound.webhooks).toBe(false);
    expect(ICAL_PROVIDER_CAPABILITIES.inbound.reservationImport).toBe(false);
    expect(ICAL_PROVIDER_CAPABILITIES.core.availabilityExport).toBe(false);
    expect(ICAL_PROVIDER_CAPABILITIES.core.rateExport).toBe(false);
    expect(ICAL_PROVIDER_CAPABILITIES.core.restrictionExport).toBe(false);
    expect(ICAL_PROVIDER_CAPABILITIES.optional.reservationExport).toBe(false);
    expect(ICAL_PROVIDER_CAPABILITIES.optional.reservationExportOperations).toEqual([]);
    expect(ICAL_PROVIDER_CAPABILITIES.connectionAuth).toBe(false);
  });
});

describe("Provider-1 P1-S1 — createIcalProviderRegistration", () => {
  it("passes registration validation as polling-only", () => {
    const registration = createTestIcalProviderRegistration(encodeIcsCalendar([]));
    expect(() => validateChannelProviderRegistration(registration)).not.toThrow();
    expect(registration.providerId).toBe("ical");
    expect(registration.status).toBe("active");
    expect(registration.capabilities).toEqual(ICAL_PROVIDER_CAPABILITIES);
    expect(registration.polling).not.toBeNull();
    expect(registration.auth).toBeNull();
    expect(registration.webhooks).toBeNull();
    expect(registration.reservationImport).toBeNull();
    expect(registration.availabilityExport).toBeNull();
    expect(registration.rateRestrictionExport).toBeNull();
    expect(registration.reservationExport).toBeNull();
    expect(registration.pollAuthPolicy).toEqual({ requiresCredentialRef: true });
    expect(registration.allowedFeedSemanticModes).toEqual([
      "availability_block_feed",
      "mixed_or_unknown_feed",
    ]);
  });

  it("is discoverable in an isolated registry and resolves polling", () => {
    const registry = new ChannelProviderRegistry();
    const registration = createTestIcalProviderRegistration(encodeIcsCalendar([]));
    registry.register(registration);

    expect(registry.get("ical")?.providerId).toBe("ical");
    expect(registry.resolvePolling("ical")).toBe(registration.polling);
    expect(registry.resolveWebhooks("ical")).toBeNull();
    expect(registry.resolveReservationImport("ical")).toBeNull();
    expect(registry.resolveAvailabilityExport("ical")).toBeNull();
    expect(registry.resolveRateRestrictionExport("ical")).toBeNull();
    expect(registry.resolveReservationExport("ical")).toBeNull();
    expect(registry.resolveAuth("ical")).toBeNull();
  });

  it("poll() requires feedUrl credential material (P1-S5 path)", async () => {
    const registry = new ChannelProviderRegistry();
    registry.register(
      createTestIcalProviderRegistration(
        encodeIcsCalendar([{ uid: "a@x", dtstart: "20260101", dtend: "20260102" }]),
      ),
    );
    const polling = registry.resolvePolling("ical");
    expect(polling).not.toBeNull();

    await expect(polling!.poll("conn-1", null, {})).rejects.toMatchObject({
      name: "ValidationError",
    });

    const result = await polling!.poll("conn-1", null, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.kind).toBe("reservation.unknown");
    expect(result.nextCursor).not.toBeNull();
  });

  it("rejects capability/port mismatches under existing validation", () => {
    const base = createTestIcalProviderRegistration(encodeIcsCalendar([]));
    const stubImport: IChannelReservationImportProvider = {
      mapMessage: async () => {
        throw new Error("unused");
      },
    };
    const stubAvailability: IChannelAvailabilityExportProvider = {
      publishAvailability: async () => ({ success: true }),
    };

    expect(() =>
      validateChannelProviderRegistration(
        withDefaultProviderRegistrationPolicies({
          ...base,
          polling: null,
        }),
      ),
    ).toThrow(ChannelProviderRegistrationError);

    expect(() =>
      validateChannelProviderRegistration(
        withDefaultProviderRegistrationPolicies({
          ...base,
          reservationImport: stubImport,
        }),
      ),
    ).toThrow(ChannelProviderRegistrationError);

    expect(() =>
      validateChannelProviderRegistration(
        withDefaultProviderRegistrationPolicies({
          ...base,
          availabilityExport: stubAvailability,
        }),
      ),
    ).toThrow(ChannelProviderRegistrationError);
  });

  it("registers IcalPollingProvider with injected fetcher", () => {
    const registration = createTestIcalProviderRegistration(encodeIcsCalendar([]));
    expect(registration.polling).toBeInstanceOf(IcalPollingProvider);
  });
});

/**
 * P1-S7c Phase A closure: previous S6/S7 tests injected custom registrations with a
 * broad FEED_SEMANTIC_MODES allow-list, bypassing the production iCal factory.
 * These cases instantiate createIcalProviderRegistration() directly.
 */
describe("Provider-1 P1-S7c — production createIcalProviderRegistration semantic allow-list", () => {
  function productionRegistration() {
    return createIcalProviderRegistration({
      feedFetcher: createStaticIcalFeedFetcher(encodeIcsCalendar([])),
    });
  }

  it("allows availability_block_feed via the real factory", () => {
    const registration = productionRegistration();
    expect(
      isFeedSemanticModeAllowed(
        "availability_block_feed",
        registration.allowedFeedSemanticModes,
      ),
    ).toBe(true);
  });

  it("allows mixed_or_unknown_feed via the real factory", () => {
    const registration = productionRegistration();
    expect(
      isFeedSemanticModeAllowed(
        "mixed_or_unknown_feed",
        registration.allowedFeedSemanticModes,
      ),
    ).toBe(true);
  });

  it("does not allow reservation_feed via the real factory", () => {
    const registration = productionRegistration();
    expect(
      isFeedSemanticModeAllowed(
        "reservation_feed",
        registration.allowedFeedSemanticModes,
      ),
    ).toBe(false);
    expect(resolveAllowedFeedSemanticModes(registration.allowedFeedSemanticModes)).not.toContain(
      "reservation_feed",
    );
  });

  it("keeps mayEmitReservationCreate false (inventory-only Provider-1)", () => {
    expect(
      mayEmitReservationCreate({
        semanticMode: "availability_block_feed",
        semanticConfigVersion: 1,
      }),
    ).toBe(false);
    expect(
      mayEmitReservationCreate({
        semanticMode: "reservation_feed",
        semanticConfigVersion: 1,
      }),
    ).toBe(false);
    expect(productionRegistration().capabilities.inbound.reservationImport).toBe(false);
  });

  it("semantic-mode policy accepts availability_block_feed against the production registration", () => {
    const registration = productionRegistration();
    expect(() =>
      assertFeedSemanticModeAllowed(
        "availability_block_feed",
        registration.allowedFeedSemanticModes,
      ),
    ).not.toThrow();
    expect(() =>
      assertFeedSemanticModeAllowed(
        "reservation_feed",
        registration.allowedFeedSemanticModes,
      ),
    ).toThrow(ValidationError);
  });
});
