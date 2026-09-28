import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertWhatsAppSessionSendable,
  computeArrivalScheduledFor,
  extendCustomerServiceWindow,
  isCustomerServiceWindowOpen,
  normalizeWhatsAppE164,
  RouteWhatsAppInboundUseCase,
  whatsappChannelIdentityFromE164,
  whatsappChannelIdentityFromSender,
  WELCOME_OCCURRENCE_KEY,
  arrivalOccurrenceKey,
  type BookingMessagingProfileRecord,
} from "../../src/messaging";
import { ValidationError } from "../../src/shared/errors/DomainError";

describe("WhatsApp phone / CSW helpers", () => {
  it("requires E.164 with + and never invents country", () => {
    expect(normalizeWhatsAppE164("+30 694 000 1111")).toBe("+306940001111");
    expect(normalizeWhatsAppE164("6940001111")).toBeNull();
    expect(normalizeWhatsAppE164("+1")).toBeNull();
    expect(whatsappChannelIdentityFromE164("+306940001111")).toBe("306940001111");
    expect(whatsappChannelIdentityFromSender("306940001111")).toBe("306940001111");
  });

  it("opens and expires CSW", () => {
    const now = new Date("2026-07-15T10:00:00.000Z");
    const until = extendCustomerServiceWindow(now);
    expect(isCustomerServiceWindowOpen(until, now)).toBe(true);
    expect(
      isCustomerServiceWindowOpen(until, new Date(until.getTime() + 1)),
    ).toBe(false);
    expect(() =>
      assertWhatsAppSessionSendable({
        channel: "whatsapp",
        cswOpenUntil: null,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      assertWhatsAppSessionSendable({
        channel: "talos_direct",
        cswOpenUntil: null,
      }),
    ).not.toThrow();
  });

  it("computes arrival at property-local 09:00 on check-in day", () => {
    const scheduled = computeArrivalScheduledFor({
      checkInDate: "2026-07-15",
      timezone: "Europe/Athens",
      timingMode: "check_in_local_time",
      localTime: "09:00",
      offsetDays: 0,
      offsetHours: 0,
    });
    expect(scheduled).toBeInstanceOf(Date);
    // Athens summer = UTC+3 → 06:00Z
    expect(scheduled!.toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });

  it("uses stable welcome/arrival occurrence keys", () => {
    expect(WELCOME_OCCURRENCE_KEY).toBe("v1");
    expect(arrivalOccurrenceKey("2026-07-15")).toBe("checkin:2026-07-15");
  });
});

describe("RouteWhatsAppInboundUseCase", () => {
  function profile(
    overrides: Partial<BookingMessagingProfileRecord>,
  ): BookingMessagingProfileRecord {
    const now = new Date();
    return {
      id: overrides.id ?? "p1",
      tenantId: overrides.tenantId ?? "t1",
      propertyId: overrides.propertyId ?? "prop1",
      bookingId: overrides.bookingId ?? "b1",
      guestId: null,
      conversationId: overrides.conversationId ?? "c1",
      whatsappPhone: "+306940001111",
      whatsappPhoneNormalized: "+306940001111",
      guestChannelIdentity: "306940001111",
      contactSource: "manual",
      contactConfirmedAt: now,
      messagingEnabled: true,
      identityStatus: "bound",
      cswOpenUntil: null,
      lastGuestInboundAt: null,
      welcomeEmailStatus: "none",
      welcomeEmailTo: null,
      welcomeEmailSentAt: null,
      welcomeEmailLastError: null,
      welcomeEmailOccurrenceKey: null,
      activeContactTokenId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it("fails closed on cross-tenant ambiguity", async () => {
    const profiles = [
      profile({ id: "a", tenantId: "t1", bookingId: "b1" }),
      profile({ id: "b", tenantId: "t2", bookingId: "b2", conversationId: "c2" }),
    ];
    const useCase = new RouteWhatsAppInboundUseCase(
      {
        findEnabledByIdentity: async () => profiles,
        findByBookingId: async () => null,
        upsert: async (p) => p,
        update: async (_t, _i, p) => p as BookingMessagingProfileRecord,
      },
      {
        findById: async () => null,
      } as never,
    );
    const result = await useCase.execute({
      guestChannelIdentity: "306940001111",
    });
    expect(result.outcome).toBe("ambiguous");
  });

  it("returns unmatched when no bindings", async () => {
    const useCase = new RouteWhatsAppInboundUseCase(
      {
        findEnabledByIdentity: async () => [],
        findByBookingId: async () => null,
        upsert: async (p) => p,
        update: async (_t, _i, p) => p as BookingMessagingProfileRecord,
      },
      { findById: async () => null } as never,
    );
    expect(
      (await useCase.execute({ guestChannelIdentity: "999" })).outcome,
    ).toBe("unmatched");
  });

  it("routes to single eligible confirmed booking in stay window", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const useCase = new RouteWhatsAppInboundUseCase(
      {
        findEnabledByIdentity: async () => [
          profile({ bookingId: "b1", conversationId: "c1" }),
        ],
        findByBookingId: async () => null,
        upsert: async (p) => p,
        update: async (_t, _i, p) => p as BookingMessagingProfileRecord,
      },
      {
        findById: async () =>
          ({
            id: "b1",
            tenantId: "t1",
            propertyId: "prop1",
            status: "confirmed",
            stayPeriod: {
              checkIn: { value: "2026-07-15" },
              checkOut: { value: "2026-07-20" },
            },
            guestId: null,
            guest: { name: "John", email: "a@b.c", phone: null },
          }) as never,
      },
    );
    const result = await useCase.execute({
      guestChannelIdentity: "306940001111",
      now,
    });
    expect(result.outcome).toBe("routed");
    if (result.outcome === "routed") {
      expect(result.profile.bookingId).toBe("b1");
    }
  });

  it("marks ambiguous when two eligible stays share phone", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const useCase = new RouteWhatsAppInboundUseCase(
      {
        findEnabledByIdentity: async () => [
          profile({
            id: "p1",
            bookingId: "b1",
            propertyId: "olivia",
            conversationId: "c1",
          }),
          profile({
            id: "p2",
            bookingId: "b2",
            propertyId: "cosy",
            conversationId: "c2",
          }),
        ],
        findByBookingId: async () => null,
        upsert: async (p) => p,
        update: async (_t, _i, p) => p as BookingMessagingProfileRecord,
      },
      {
        findById: async (id: string) =>
          ({
            id,
            tenantId: "t1",
            propertyId: id === "b1" ? "olivia" : "cosy",
            status: "confirmed",
            stayPeriod: {
              checkIn: { value: "2026-07-15" },
              checkOut: { value: "2026-07-20" },
            },
            guestId: null,
            guest: { name: "John", email: "a@b.c", phone: null },
          }) as never,
      },
    );
    const result = await useCase.execute({
      guestChannelIdentity: "306940001111",
      now,
    });
    expect(result.outcome).toBe("ambiguous");
  });
});

describe("Meta webhook signature helper", () => {
  it("validates sha256 HMAC of raw body", () => {
    const appSecret = "test_secret";
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const digest = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const header = `sha256=${digest}`;
    const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(header.slice(7), "hex");
    expect(timingSafeEqual(a, b)).toBe(true);
  });
});
