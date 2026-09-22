import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOKING_COM_PROVIDER_CAPABILITIES,
  BOOKING_COM_TOKEN_DEFAULT_TTL_SECONDS,
  BOOKING_COM_TOKEN_EXCHANGE_RATE_LIMIT_PER_HOUR,
  BOOKING_COM_V1_CONNECTION_TYPES,
  BOOKING_COM_V1_DEFAULT_PRICING_MODEL,
  BookingComHotelId,
  BookingComRatePlanId,
  BookingComReservationId,
  BookingComRoomRateId,
  BookingComRoomTypeId,
  BookingComRuid,
  ChannelProviderRegistry,
  assertBookingComCredentialMaterialShape,
  assertBookingComSetupReadyForActivation,
  createBookingComProviderRegistration,
  createDefaultBookingComConnectionSetup,
  parseBookingComConnectionSetup,
  validateChannelProviderRegistration,
} from "../../../src/channels";
import { ValidationError } from "../../../src/shared/errors/DomainError";

const FIXTURES_DIR = join(__dirname, "fixtures");

describe("CM-4c-1 — BOOKING_COM_PROVIDER_CAPABILITIES", () => {
  it("matches the approved V1 capability truth table", () => {
    expect(BOOKING_COM_PROVIDER_CAPABILITIES.inbound.polling).toBe(true);
    expect(BOOKING_COM_PROVIDER_CAPABILITIES.inbound.webhooks).toBe(false);
    expect(BOOKING_COM_PROVIDER_CAPABILITIES.inbound.reservationImport).toBe(true);
    expect(BOOKING_COM_PROVIDER_CAPABILITIES.core.availabilityExport).toBe(true);
    expect(BOOKING_COM_PROVIDER_CAPABILITIES.core.rateExport).toBe(true);
    expect(BOOKING_COM_PROVIDER_CAPABILITIES.core.restrictionExport).toBe(true);
    expect(BOOKING_COM_PROVIDER_CAPABILITIES.optional.reservationExport).toBe(false);
    expect(BOOKING_COM_PROVIDER_CAPABILITIES.connectionAuth).toBe(false);
  });
});

describe("CM-4c-1 — createBookingComProviderRegistration", () => {
  it("passes registration validation with fail-closed stubs", () => {
    const registration = createBookingComProviderRegistration();
    expect(() => validateChannelProviderRegistration(registration)).not.toThrow();
    expect(registration.providerId).toBe("booking_com");
    expect(registration.status).toBe("active");
    expect(registration.capabilities).toEqual(BOOKING_COM_PROVIDER_CAPABILITIES);
    expect(registration.auth).toBeNull();
    expect(registration.webhooks).toBeNull();
    expect(registration.polling).not.toBeNull();
    expect(registration.reservationImport).not.toBeNull();
    expect(registration.availabilityExport).not.toBeNull();
    expect(registration.rateRestrictionExport).not.toBeNull();
    expect(registration.reservationExport).toBeNull();
    expect(registration.pollAuthPolicy).toEqual({ requiresCredentialRef: true });
  });

  it("is discoverable in an isolated registry", async () => {
    const registry = new ChannelProviderRegistry();
    const registration = createBookingComProviderRegistration();
    registry.register(registration);

    expect(registry.get("booking_com")?.providerId).toBe("booking_com");
    expect(registry.resolvePolling("booking_com")).toBe(registration.polling);
    expect(registry.resolveReservationImport("booking_com")).toBe(
      registration.reservationImport,
    );
    expect(registry.resolveAvailabilityExport("booking_com")).toBe(
      registration.availabilityExport,
    );
    expect(registry.resolveRateRestrictionExport("booking_com")).toBe(
      registration.rateRestrictionExport,
    );
    expect(registry.resolveAuth("booking_com")).toBeNull();
    expect(registry.resolveWebhooks("booking_com")).toBeNull();

    await expect(
      registry.resolvePolling("booking_com")!.poll("conn-1", null, {}),
    ).rejects.toMatchObject({ code: "BOOKING_COM_RESERVATIONS_CLIENT_NOT_CONFIGURED" });

    await expect(
      registry.resolveAvailabilityExport("booking_com")!.publishAvailability({
        tenantId: "t1",
        unitId: "u1",
        connectionId: "c1",
        mappingId: "m1",
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 1,
      }),
    ).rejects.toThrow(/mapping must be resolved|not configured/i);

    const mapped = await registry.resolveReservationImport("booking_com")!.mapMessage(
      {
        messageId: "m1",
        kind: "reservation.create",
        receivedAt: new Date(),
        connectionId: "c1",
        provider: "booking_com",
        payload: { raw: "{}" },
      },
      {
        tenantId: "t1",
        connectionId: "c1",
        propertyId: "p1",
        unitId: "u1",
      },
    );
    expect(mapped.kind).toBe("unrecognized");
  });
});

describe("CM-4c-1 — machine credential material", () => {
  it("accepts client_id + client_secret", () => {
    expect(() =>
      assertBookingComCredentialMaterialShape({
        client_id: "client-uuid",
        client_secret: "secret-value",
      }),
    ).not.toThrow();
  });

  it("rejects missing client_secret without echoing values", () => {
    expect(() =>
      assertBookingComCredentialMaterialShape({ client_id: "only-id" }),
    ).toThrow(ValidationError);
    try {
      assertBookingComCredentialMaterialShape({ client_id: "only-id" });
    } catch (error) {
      expect(String(error)).not.toContain("only-id");
    }
  });

  it("rejects embedded JWT/access tokens in vault material", () => {
    expect(() =>
      assertBookingComCredentialMaterialShape({
        client_id: "id",
        client_secret: "secret",
        jwt: "eyJhbGciOiJIUzI1NiJ9.e30.sig",
      }),
    ).toThrow(/must not embed JWT/);
  });
});

describe("CM-4c-1 — identifiers", () => {
  it("constructs hotel/room/rate/roomrate/reservation/ruid identities", () => {
    const hotelId = BookingComHotelId("8135188");
    const roomTypeId = BookingComRoomTypeId("1000202");
    const ratePlanId = BookingComRatePlanId("12345");
    const roomRate = BookingComRoomRateId({
      hotelId,
      roomTypeId,
      ratePlanId,
    });
    expect(roomRate.hotelId).toBe(hotelId);
    expect(BookingComReservationId("1234567890")).toBe("1234567890");
    expect(BookingComRuid("fixture-ruid")).toBe("fixture-ruid");
  });

  it("rejects empty identifiers", () => {
    expect(() => BookingComHotelId("  ")).toThrow(ValidationError);
  });
});

describe("CM-4c-1 — connections + auth contracts", () => {
  it("declares V1 connection types and Standard pricing default", () => {
    expect(BOOKING_COM_V1_CONNECTION_TYPES).toEqual(["Reservations", "AVAILABILITY"]);
    expect(BOOKING_COM_V1_DEFAULT_PRICING_MODEL).toBe("Standard");
    expect(BOOKING_COM_TOKEN_DEFAULT_TTL_SECONDS).toBe(3600);
    expect(BOOKING_COM_TOKEN_EXCHANGE_RATE_LIMIT_PER_HOUR).toBe(30);
  });
});

describe("CM-4c-1 — setup metadata", () => {
  it("defaults to credentials progress and blocks unsafe activation", () => {
    const setup = createDefaultBookingComConnectionSetup();
    expect(setup.setupProgress).toBe("credentials");
    expect(setup.pricingModel).toBe("Standard");
    expect(() => assertBookingComSetupReadyForActivation(setup)).toThrow(ValidationError);

    const ready = parseBookingComConnectionSetup({
      hotelId: "8135188",
      approvedConnectionTypes: ["Reservations", "AVAILABILITY"],
      pricingModel: "Standard",
      setupProgress: "ready_to_activate",
      mappingReady: true,
      initialSyncReady: true,
    });
    expect(() => assertBookingComSetupReadyForActivation(ready)).not.toThrow();
  });

  it("rejects OBP activation in V1 helper", () => {
    expect(() =>
      assertBookingComSetupReadyForActivation(
        parseBookingComConnectionSetup({
          hotelId: "8135188",
          approvedConnectionTypes: ["Reservations", "AVAILABILITY"],
          pricingModel: "OBP",
          setupProgress: "ready_to_activate",
          mappingReady: true,
          initialSyncReady: true,
        }),
      ),
    ).toThrow(/Standard pricing model only/);
  });
});

describe("CM-4c-1 — official protocol fixtures", () => {
  it("ships representative create/modify/cancel/ack/summary/ari fixtures", () => {
    const files = readdirSync(FIXTURES_DIR).sort();
    expect(files).toEqual(
      expect.arrayContaining([
        "ari-availability-request.xml",
        "ari-partial-error-response.xml",
        "connection-request.json",
        "reservation-ack.xml",
        "reservation-cancel.xml",
        "reservation-create.xml",
        "reservation-modify.xml",
        "reservation-summary.xml",
      ]),
    );

    const createXml = readFileSync(join(FIXTURES_DIR, "reservation-create.xml"), "utf8");
    expect(createXml).toContain("OTA_HotelResNotifRQ");
    expect(createXml).toContain('ResStatus="Commit"');
    expect(createXml).toContain('ID="1234567890"');

    const modifyXml = readFileSync(join(FIXTURES_DIR, "reservation-modify.xml"), "utf8");
    expect(modifyXml).toContain("OTA_HotelResModifyNotifRQ");
    expect(modifyXml).toContain('ResStatus="Modify"');

    const cancelXml = readFileSync(join(FIXTURES_DIR, "reservation-cancel.xml"), "utf8");
    expect(cancelXml).toContain('ResStatus="Cancel"');

    const ackXml = readFileSync(join(FIXTURES_DIR, "reservation-ack.xml"), "utf8");
    expect(ackXml).toContain("OTA_HotelResNotifRS");
    expect(ackXml).toContain("<Success/>");

    const summaryXml = readFileSync(join(FIXTURES_DIR, "reservation-summary.xml"), "utf8");
    expect(summaryXml).toContain("reservationssummary");

    const ariXml = readFileSync(join(FIXTURES_DIR, "ari-availability-request.xml"), "utf8");
    expect(ariXml).toContain("<roomstosell>1</roomstosell>");
    expect(ariXml).toContain("<closedonarrival>0</closedonarrival>");
    expect(ariXml).toContain("<closedondeparture>1</closedondeparture>");
    expect(ariXml).toContain("<minimumstay>2</minimumstay>");
    expect(ariXml).toContain("<maximumstay>14</maximumstay>");

    const partial = readFileSync(join(FIXTURES_DIR, "ari-partial-error-response.xml"), "utf8");
    expect(partial).toContain("RATE_NOT_ACTIVE_FOR_ROOM");
    expect(partial).toContain("RUID");

    const connection = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "connection-request.json"), "utf8"),
    ) as { connection_types: string[]; pricing_model: string };
    expect(connection.connection_types).toEqual(["Reservations", "AVAILABILITY"]);
    expect(connection.pricing_model).toBe("Standard");
  });
});
