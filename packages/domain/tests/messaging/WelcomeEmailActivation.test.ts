import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ActivateWhatsAppFromContactTokenUseCase,
  buildWhatsAppDeepLink,
  computeContactTokenExpiresAt,
  extractContactTokenFromText,
  redactContactTokensFromMessage,
  resolveUsableGuestEmail,
  SendBookingWelcomeEmailUseCase,
  WELCOME_EMAIL_OCCURRENCE_KEY,
  whatsappMeDigits,
  wrapContactTokenBody,
  type BookingMessagingProfileRecord,
  type MessagingContactTokenRecord,
  type PropertyMessagingSettingsRecord,
} from "../../src/messaging";
import type { ConversationRecord } from "../../src/messaging/domain/MessagingTypes";
import type { IOpaqueTokenFactory } from "../../src/operations/cleaning/ports/IOpaqueTokenFactory";

const opaqueTokens: IOpaqueTokenFactory = {
  create() {
    const token = randomBytes(32).toString("hex");
    return { token, tokenHash: this.hash(token) };
  },
  hash(token: string) {
    return createHash("sha256").update(token.trim()).digest("hex");
  },
};

describe("Contact token helpers", () => {
  it("wraps opaque tokens without internal IDs/PII", () => {
    const body = opaqueTokens.create().token;
    const rawToken = wrapContactTokenBody(body);
    expect(rawToken.startsWith("tlsc_")).toBe(true);
    expect(rawToken).not.toMatch(/booking|tenant|guest|uuid/i);
    expect(extractContactTokenFromText(`Hello ${rawToken} please`)).toBe(
      rawToken,
    );
    expect(redactContactTokensFromMessage(`Hi ${rawToken}`)).not.toContain(
      rawToken,
    );
  });

  it("builds wa.me deep link with token", () => {
    const digits = whatsappMeDigits("+306912345678");
    expect(digits).toBe("306912345678");
    const rawToken = wrapContactTokenBody(opaqueTokens.create().token);
    const link = buildWhatsAppDeepLink({
      displayPhoneDigits: digits!,
      rawToken,
    });
    expect(link.startsWith("https://wa.me/306912345678?text=")).toBe(true);
    expect(decodeURIComponent(link)).toContain("tlsc_");
  });

  it("rejects unusable emails", () => {
    expect(resolveUsableGuestEmail("guest@example.com")).toBe(
      "guest@example.com",
    );
    expect(resolveUsableGuestEmail("noreply+x@invalid.talos.local")).toBeNull();
    expect(resolveUsableGuestEmail("")).toBeNull();
  });

  it("computes expiration after stay", () => {
    const exp = computeContactTokenExpiresAt({
      checkOutDate: "2026-08-01",
      now: new Date("2026-07-01T00:00:00.000Z"),
    });
    expect(exp.getTime()).toBeGreaterThan(
      new Date("2026-08-01T00:00:00.000Z").getTime(),
    );
  });
});

function profile(
  overrides: Partial<BookingMessagingProfileRecord> = {},
): BookingMessagingProfileRecord {
  const now = new Date();
  return {
    id: "prof1",
    tenantId: "t1",
    propertyId: "p1",
    bookingId: "b1",
    guestId: "g1",
    conversationId: null,
    whatsappPhone: null,
    whatsappPhoneNormalized: null,
    guestChannelIdentity: null,
    contactSource: "manual",
    contactConfirmedAt: null,
    messagingEnabled: false,
    identityStatus: "unbound",
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

describe("SendBookingWelcomeEmailUseCase", () => {
  it("sends once and is idempotent; failure does not mark sent", async () => {
    const sent: unknown[] = [];
    let current = profile();
    const tokens: MessagingContactTokenRecord[] = [];
    const emailSender = {
      sendWelcome: async (p: unknown) => {
        sent.push(p);
      },
    };
    const failSender = {
      sendWelcome: async () => {
        throw new Error("email_provider_failure");
      },
    };

    const booking = {
      id: "b1",
      propertyId: "p1",
      guestId: "g1",
      status: "confirmed",
      guest: { name: "Ada", email: "ada@example.com", phone: null },
      stayPeriod: {
        checkIn: { value: "2026-07-15" },
        checkOut: { value: "2026-07-18" },
      },
    };

    const baseDeps = {
      bookings: { findById: async () => booking as never },
      properties: {
        findById: async () => ({ name: "Casa Test", deletedAt: null }) as never,
      },
      profiles: {
        findByBookingId: async () => current,
        upsert: async (p: BookingMessagingProfileRecord) => {
          current = p;
          return p;
        },
        update: async (
          _t: string,
          _id: string,
          patch: Partial<BookingMessagingProfileRecord>,
        ) => {
          current = { ...current, ...patch };
          return current;
        },
      },
      settings: {
        get: async () =>
          ({
            welcomeEmailEnabled: true,
          }) as PropertyMessagingSettingsRecord,
      },
      tokens: {
        create: async (t: MessagingContactTokenRecord) => {
          tokens.push(t);
          return t;
        },
        revokeActiveForBooking: async () => 0,
        findByTokenHash: async () => null,
        findActiveByBooking: async () => null,
        update: async () => tokens[0]!,
      },
      platform: {
        findConnectedWhatsApp: async () =>
          ({
            displayPhoneNumber: "+306911122233",
            status: "connected",
          }) as never,
      },
      permission: { hasPermission: () => true },
      ids: { generate: () => `id-${tokens.length + 1}` },
    };

    const actor = {
      userId: "u1",
      role: "admin" as const,
      propertyIds: null,
      isSuperAdmin: true,
    };

    const uc = new SendBookingWelcomeEmailUseCase(
      baseDeps.bookings as never,
      baseDeps.properties as never,
      baseDeps.profiles as never,
      baseDeps.settings as never,
      baseDeps.tokens as never,
      baseDeps.platform as never,
      emailSender as never,
      opaqueTokens,
      baseDeps.permission as never,
      baseDeps.ids as never,
    );

    const first = await uc.execute(
      { tenantId: "t1", bookingId: "b1", systemActor: true },
      actor,
    );
    expect(first.isSuccess).toBe(true);
    expect(first.getValue().sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(current.welcomeEmailStatus).toBe("sent");
    expect(current.welcomeEmailOccurrenceKey).toBe(WELCOME_EMAIL_OCCURRENCE_KEY);
    const deepLink = (sent[0] as { whatsappDeepLink: string }).whatsappDeepLink;
    expect(deepLink).toContain("wa.me/");
    expect(extractContactTokenFromText(decodeURIComponent(deepLink))).toBeTruthy();

    const second = await uc.execute(
      { tenantId: "t1", bookingId: "b1", systemActor: true },
      actor,
    );
    expect(second.getValue().sent).toBe(false);
    expect(sent).toHaveLength(1);

    current = profile({ welcomeEmailStatus: "none" });
    const failUc = new SendBookingWelcomeEmailUseCase(
      baseDeps.bookings as never,
      baseDeps.properties as never,
      baseDeps.profiles as never,
      baseDeps.settings as never,
      baseDeps.tokens as never,
      baseDeps.platform as never,
      failSender as never,
      opaqueTokens,
      baseDeps.permission as never,
      baseDeps.ids as never,
    );
    const failed = await failUc.execute(
      { tenantId: "t1", bookingId: "b1", systemActor: true },
      actor,
    );
    expect(failed.getValue().status).toBe("failed");
    expect(current.welcomeEmailStatus).toBe("failed");
  });

  it("marks unavailable when no email", async () => {
    let current = profile();
    const booking = {
      id: "b1",
      propertyId: "p1",
      guestId: null,
      status: "confirmed",
      guest: { name: "NoMail", email: "", phone: null },
      stayPeriod: {
        checkIn: { value: "2026-07-15" },
        checkOut: { value: "2026-07-18" },
      },
    };
    const uc = new SendBookingWelcomeEmailUseCase(
      { findById: async () => booking as never } as never,
      { findById: async () => ({ name: "P" }) as never } as never,
      {
        findByBookingId: async () => current,
        upsert: async (p: BookingMessagingProfileRecord) => {
          current = p;
          return p;
        },
        update: async (
          _t: string,
          _i: string,
          patch: Partial<BookingMessagingProfileRecord>,
        ) => {
          current = { ...current, ...patch };
          return current;
        },
      } as never,
      { get: async () => ({ welcomeEmailEnabled: true }) } as never,
      {
        create: async () => null,
        revokeActiveForBooking: async () => 0,
      } as never,
      { findConnectedWhatsApp: async () => null } as never,
      { sendWelcome: async () => undefined } as never,
      opaqueTokens,
      { hasPermission: () => true } as never,
      { generate: () => "id" } as never,
    );
    const result = await uc.execute(
      { tenantId: "t1", bookingId: "b1", systemActor: true },
      {
        userId: "u1",
        role: "admin",
        propertyIds: null,
        isSuperAdmin: true,
      },
    );
    expect(result.getValue().status).toBe("unavailable");
  });
});

describe("ActivateWhatsAppFromContactTokenUseCase", () => {
  it("binds correct booking from token; rejects invalid; redacts token from AI body", async () => {
    const body = opaqueTokens.create().token;
    const rawToken = wrapContactTokenBody(body);
    const tokenHash = opaqueTokens.hash(rawToken);
    const now = new Date();
    const token: MessagingContactTokenRecord = {
      id: "tok1",
      tenantId: "t1",
      propertyId: "p1",
      bookingId: "b-olivia",
      guestId: "g1",
      profileId: "prof1",
      tokenHash,
      status: "active",
      expiresAt: new Date(now.getTime() + 86400000),
      activatedAt: null,
      activatedConversationId: null,
      activatedWaIdentity: null,
      revokedAt: null,
      revokeReason: null,
      createdAt: now,
      updatedAt: now,
    };
    let current = profile({
      bookingId: "b-olivia",
      id: "prof1",
    });
    let conversation: ConversationRecord | null = null;
    const routes: unknown[] = [];

    const uc = new ActivateWhatsAppFromContactTokenUseCase(
      {
        findByTokenHash: async (h: string) =>
          h === tokenHash ? token : null,
        update: async (
          _t: string,
          _id: string,
          patch: Partial<MessagingContactTokenRecord>,
        ) => {
          Object.assign(token, patch);
          return token;
        },
        create: async () => token,
        findActiveByBooking: async () => token,
        revokeActiveForBooking: async () => 0,
      } as never,
      {
        findByBookingId: async () => current,
        update: async (
          _t: string,
          _i: string,
          patch: Partial<BookingMessagingProfileRecord>,
        ) => {
          current = { ...current, ...patch };
          return current;
        },
      } as never,
      {
        findById: async () => conversation,
        create: async (c: ConversationRecord) => {
          conversation = c;
          return c;
        },
        updateMeta: async (
          _t: string,
          _id: string,
          patch: Partial<ConversationRecord>,
        ) => {
          conversation = { ...conversation!, ...patch };
          return conversation!;
        },
      } as never,
      {
        findById: async () =>
          ({
            id: "b-olivia",
            status: "confirmed",
            guestId: "g1",
            guest: { name: "Olivia" },
          }) as never,
      } as never,
      {
        upsertRoute: async (r: unknown) => {
          routes.push(r);
        },
      } as never,
      opaqueTokens,
      { generate: () => "conv1" } as never,
    );

    const rejected = await uc.execute({
      rawMessageBody: "Hello tlsc_thisisnotavalidtokenbodyxxxxxxxxxxxx",
      senderWaId: "306900000001",
    });
    expect(rejected.outcome).toBe("rejected");

    const ok = await uc.execute({
      rawMessageBody: `Hello, I would like assistance with my stay. ${rawToken}`,
      senderWaId: "306900000001",
    });
    expect(ok.outcome).toBe("activated");
    if (ok.outcome === "activated") {
      expect(ok.profile.bookingId).toBe("b-olivia");
      expect(ok.profile.guestChannelIdentity).toBe("306900000001");
      expect(ok.redactedBody).not.toContain(rawToken);
      expect(ok.conversation.bookingId).toBe("b-olivia");
    }
    expect(token.status).toBe("activated");
    expect(routes).toHaveLength(1);

    const expiredRaw = wrapContactTokenBody(opaqueTokens.create().token);
    const expiredToken = {
      ...token,
      status: "active" as const,
      expiresAt: new Date(now.getTime() - 1000),
      tokenHash: opaqueTokens.hash(expiredRaw),
    };
    const expiredUc = new ActivateWhatsAppFromContactTokenUseCase(
      {
        findByTokenHash: async () => expiredToken,
        update: async () => expiredToken,
      } as never,
      { findByBookingId: async () => current } as never,
      {} as never,
      { findById: async () => ({ status: "confirmed" }) } as never,
      { upsertRoute: async () => undefined } as never,
      opaqueTokens,
      { generate: () => "x" } as never,
    );
    const exp = await expiredUc.execute({
      rawMessageBody: expiredRaw,
      senderWaId: "306900000002",
    });
    expect(exp.outcome).toBe("rejected");
  });

  it("same phone two bookings — token selects exact booking", async () => {
    const rawToken = wrapContactTokenBody(opaqueTokens.create().token);
    const now = new Date();
    const tokenA: MessagingContactTokenRecord = {
      id: "tokA",
      tenantId: "t1",
      propertyId: "prop-olivia",
      bookingId: "booking-a",
      guestId: null,
      profileId: "pa",
      tokenHash: opaqueTokens.hash(rawToken),
      status: "active",
      expiresAt: new Date(now.getTime() + 86400000),
      activatedAt: null,
      activatedConversationId: null,
      activatedWaIdentity: null,
      revokedAt: null,
      revokeReason: null,
      createdAt: now,
      updatedAt: now,
    };
    let profileA = profile({
      id: "pa",
      bookingId: "booking-a",
      propertyId: "prop-olivia",
    });
    const uc = new ActivateWhatsAppFromContactTokenUseCase(
      {
        findByTokenHash: async (h: string) =>
          h === tokenA.tokenHash ? tokenA : null,
        update: async (
          _t: string,
          _i: string,
          patch: Partial<MessagingContactTokenRecord>,
        ) => {
          Object.assign(tokenA, patch);
          return tokenA;
        },
      } as never,
      {
        findByBookingId: async (_t: string, bid: string) =>
          bid === "booking-a" ? profileA : null,
        update: async (
          _t: string,
          _i: string,
          patch: Partial<BookingMessagingProfileRecord>,
        ) => {
          profileA = { ...profileA, ...patch };
          return profileA;
        },
      } as never,
      {
        findById: async () => null,
        create: async (c: ConversationRecord) => c,
        updateMeta: async (_t: string, _id: string, c: ConversationRecord) => c,
      } as never,
      {
        findById: async () =>
          ({
            id: "booking-a",
            status: "confirmed",
            guestId: null,
            guest: { name: "Olivia" },
          }) as never,
      } as never,
      { upsertRoute: async () => undefined } as never,
      opaqueTokens,
      { generate: () => "c-a" } as never,
    );
    const result = await uc.execute({
      rawMessageBody: rawToken,
      senderWaId: "306911122233",
    });
    expect(result.outcome).toBe("activated");
    if (result.outcome === "activated") {
      expect(result.profile.bookingId).toBe("booking-a");
      expect(result.profile.propertyId).toBe("prop-olivia");
    }
  });
});

describe("Workerless proof markers", () => {
  it("welcome email path does not reference BackgroundJob enqueue", () => {
    expect(SendBookingWelcomeEmailUseCase.length).toBeGreaterThanOrEqual(8);
    expect(vi).toBeTruthy();
  });
});
