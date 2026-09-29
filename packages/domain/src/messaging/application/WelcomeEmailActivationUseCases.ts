import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { IOpaqueTokenFactory } from "../../operations/cleaning/ports/IOpaqueTokenFactory";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import type { IBookingRepository } from "../../commerce/ports/CommercePorts";
import { canWriteMessagingOnProperty } from "./messagingAccess";
import type { IConversationRepository } from "../ports/IMessagingRepositories";
import type {
  IBookingMessagingProfileRepository,
  IGuestWelcomeEmailSender,
  IMessagingContactTokenRepository,
  IMessagingWaIdentityRouteWriter,
  IPlatformMessagingConnectionRepository,
  IPropertyMessagingSettingsRepository,
} from "../ports/IWhatsAppMessagingPorts";
import type { BookingMessagingProfileRecord } from "../domain/WhatsAppMessagingTypes";
import type { ConversationRecord } from "../domain/MessagingTypes";
import {
  buildWhatsAppDeepLink,
  computeContactTokenExpiresAt,
  extractContactTokenFromText,
  redactContactTokensFromMessage,
  resolveUsableGuestEmail,
  WELCOME_EMAIL_OCCURRENCE_KEY,
  whatsappMeDigits,
  wrapContactTokenBody,
  type MessagingContactTokenRecord,
} from "../domain/ContactToken";
import {
  extendCustomerServiceWindow,
  whatsappChannelIdentityFromSender,
} from "../domain/WhatsAppMessagingTypes";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function emptyWelcomeFields(): Pick<
  BookingMessagingProfileRecord,
  | "welcomeEmailStatus"
  | "welcomeEmailTo"
  | "welcomeEmailSentAt"
  | "welcomeEmailLastError"
  | "welcomeEmailOccurrenceKey"
  | "activeContactTokenId"
> {
  return {
    welcomeEmailStatus: "none",
    welcomeEmailTo: null,
    welcomeEmailSentAt: null,
    welcomeEmailLastError: null,
    welcomeEmailOccurrenceKey: null,
    activeContactTokenId: null,
  };
}

/**
 * Shared mint: opaque contact token + wa.me deep link (same path as Welcome Email).
 * Raw token is returned once to the caller; only hash is persisted.
 */
export async function mintBookingWhatsAppActivationLink(params: {
  tenantId: string;
  booking: {
    id: string;
    propertyId: string;
    guestId: string | null;
    stayPeriod: { checkOut: { value: string } };
  };
  profile: BookingMessagingProfileRecord;
  revokeReason: string;
  profiles: IBookingMessagingProfileRepository;
  tokens: IMessagingContactTokenRepository;
  platformConnections: IPlatformMessagingConnectionRepository;
  opaqueTokens: IOpaqueTokenFactory;
  ids: IIdGenerator;
}): Promise<
  | {
      ok: true;
      rawToken: string;
      deepLink: string;
      digits: string;
      token: MessagingContactTokenRecord;
      profile: BookingMessagingProfileRecord;
    }
  | { ok: false; code: "whatsapp_display_number_missing" }
> {
  const connection = await params.platformConnections.findConnectedWhatsApp();
  const digits = whatsappMeDigits(connection?.displayPhoneNumber ?? null);
  if (!digits) {
    return { ok: false, code: "whatsapp_display_number_missing" };
  }

  await params.tokens.revokeActiveForBooking(
    params.tenantId,
    params.booking.id,
    params.revokeReason,
  );

  const material = params.opaqueTokens.create();
  const rawToken = wrapContactTokenBody(material.token);
  const tokenHash = params.opaqueTokens.hash(rawToken);
  const now = new Date();
  const token: MessagingContactTokenRecord = {
    id: params.ids.generate(),
    tenantId: params.tenantId,
    propertyId: params.booking.propertyId,
    bookingId: params.booking.id,
    guestId: params.booking.guestId,
    profileId: params.profile.id,
    tokenHash,
    status: "active",
    expiresAt: computeContactTokenExpiresAt({
      checkOutDate: params.booking.stayPeriod.checkOut.value,
      now,
    }),
    activatedAt: null,
    activatedConversationId: null,
    activatedWaIdentity: null,
    revokedAt: null,
    revokeReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await params.tokens.create(token);

  const profile = await params.profiles.update(params.tenantId, params.profile.id, {
    activeContactTokenId: token.id,
  });

  const deepLink = buildWhatsAppDeepLink({
    displayPhoneDigits: digits,
    rawToken,
  });

  return { ok: true, rawToken, deepLink, digits, token, profile };
}

/**
 * Immediate Welcome Email + opaque contact token (workerless).
 * Idempotent per Booking occurrence unless manualResend.
 */
export class SendBookingWelcomeEmailUseCase {
  constructor(
    private readonly bookings: IBookingRepository,
    private readonly properties: IPropertyRepository,
    private readonly profiles: IBookingMessagingProfileRepository,
    private readonly settings: IPropertyMessagingSettingsRepository,
    private readonly tokens: IMessagingContactTokenRepository,
    private readonly platformConnections: IPlatformMessagingConnectionRepository,
    private readonly emailSender: IGuestWelcomeEmailSender,
    private readonly opaqueTokens: IOpaqueTokenFactory,
    private readonly permissionChecker: PermissionChecker,
    private readonly ids: IIdGenerator,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      bookingId: string;
      /** Operator deliberate resend — audited; rotates token. */
      manualResend?: boolean;
      /** System hook (confirm/import) — skips write ACL when true. */
      systemActor?: boolean;
    },
    actor: ActorContext,
  ): Promise<
    Result<
      {
        profile: BookingMessagingProfileRecord;
        sent: boolean;
        status: BookingMessagingProfileRecord["welcomeEmailStatus"];
      },
      Error
    >
  > {
    try {
      const booking = await this.bookings.findById(
        input.bookingId,
        input.tenantId,
      );
      if (!booking) {
        return Result.fail(new NotFoundError("Booking", input.bookingId));
      }

      if (
        !input.systemActor &&
        !canWriteMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          booking.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      if (booking.status === "cancelled") {
        return Result.fail(new ValidationError("Booking is cancelled"));
      }
      if (booking.status !== "confirmed" && !input.manualResend) {
        // Auto activation only on confirmed; manual may still be blocked.
        return Result.ok({
          profile: await this.ensureProfileSkeleton(booking, input.tenantId),
          sent: false,
          status: "none",
        });
      }
      if (booking.status !== "confirmed") {
        return Result.fail(new ValidationError("Booking must be confirmed"));
      }

      const settings = await this.settings.get(
        input.tenantId,
        booking.propertyId,
      );
      const welcomeEmailEnabled = settings?.welcomeEmailEnabled !== false;
      if (!welcomeEmailEnabled) {
        const profile = await this.ensureProfileSkeleton(booking, input.tenantId);
        const updated = await this.profiles.update(input.tenantId, profile.id, {
          welcomeEmailStatus: "unavailable",
          welcomeEmailLastError: "welcome_email_disabled",
        });
        return Result.ok({ profile: updated, sent: false, status: "unavailable" });
      }

      const email = resolveUsableGuestEmail(booking.guest.email);
      if (!email) {
        const profile = await this.ensureProfileSkeleton(booking, input.tenantId);
        const updated = await this.profiles.update(input.tenantId, profile.id, {
          welcomeEmailStatus: "unavailable",
          welcomeEmailTo: null,
          welcomeEmailLastError: "no_usable_email",
        });
        return Result.ok({ profile: updated, sent: false, status: "unavailable" });
      }

      let profile = await this.ensureProfileSkeleton(booking, input.tenantId);

      if (
        profile.welcomeEmailStatus === "sent" &&
        profile.welcomeEmailOccurrenceKey === WELCOME_EMAIL_OCCURRENCE_KEY &&
        !input.manualResend
      ) {
        return Result.ok({ profile, sent: false, status: "sent" });
      }

      const property = await this.properties.findById(
        input.tenantId,
        booking.propertyId,
      );

      const minted = await mintBookingWhatsAppActivationLink({
        tenantId: input.tenantId,
        booking,
        profile,
        revokeReason: input.manualResend ? "manual_resend" : "reissue",
        profiles: this.profiles,
        tokens: this.tokens,
        platformConnections: this.platformConnections,
        opaqueTokens: this.opaqueTokens,
        ids: this.ids,
      });

      if (!minted.ok) {
        profile = await this.profiles.update(input.tenantId, profile.id, {
          welcomeEmailStatus: "failed",
          welcomeEmailTo: email,
          welcomeEmailLastError: minted.code,
          welcomeEmailOccurrenceKey: WELCOME_EMAIL_OCCURRENCE_KEY,
        });
        return Result.ok({ profile, sent: false, status: "failed" });
      }

      const now = new Date();
      profile = await this.profiles.update(input.tenantId, minted.profile.id, {
        welcomeEmailStatus: "pending",
        welcomeEmailTo: email,
        welcomeEmailLastError: null,
        welcomeEmailOccurrenceKey: WELCOME_EMAIL_OCCURRENCE_KEY,
        activeContactTokenId: minted.token.id,
      });

      try {
        await this.emailSender.sendWelcome({
          to: email,
          propertyName: property?.name ?? "Your stay",
          guestName: booking.guest.name || null,
          checkIn: booking.stayPeriod.checkIn.value,
          checkOut: booking.stayPeriod.checkOut.value,
          whatsappDeepLink: minted.deepLink,
        });
      } catch (sendError) {
        const code =
          sendError instanceof Error
            ? sendError.message.slice(0, 120)
            : "email_send_failed";
        profile = await this.profiles.update(input.tenantId, profile.id, {
          welcomeEmailStatus: "failed",
          welcomeEmailLastError: code,
        });
        return Result.ok({ profile, sent: false, status: "failed" });
      }

      profile = await this.profiles.update(input.tenantId, profile.id, {
        welcomeEmailStatus: "sent",
        welcomeEmailSentAt: now,
        welcomeEmailLastError: null,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: input.manualResend
          ? "messaging.welcome_email_resent"
          : "messaging.welcome_email_sent",
        resourceType: "booking_messaging_profile",
        resourceId: profile.id,
        metadata: {
          bookingId: booking.id,
          emailDomain: email.includes("@") ? email.split("@")[1] : null,
          manualResend: Boolean(input.manualResend),
        },
        ipAddress: null,
      });

      return Result.ok({ profile, sent: true, status: "sent" });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }

  private async ensureProfileSkeleton(
    booking: {
      id: string;
      propertyId: string;
      guestId: string | null;
      tenantId?: string;
    },
    tenantId: string,
  ): Promise<BookingMessagingProfileRecord> {
    const existing = await this.profiles.findByBookingId(tenantId, booking.id);
    if (existing) return existing;
    const now = new Date();
    return this.profiles.upsert({
      id: this.ids.generate(),
      tenantId,
      propertyId: booking.propertyId,
      bookingId: booking.id,
      guestId: booking.guestId,
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
      ...emptyWelcomeFields(),
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Demo/dev-only: mint the same Welcome Email WhatsApp deep link without sending email.
 * Returns the plaintext token once; DB stores hash only. Does not enqueue jobs.
 */
export class PrepareBookingWhatsAppActivationLinkUseCase {
  constructor(
    private readonly bookings: IBookingRepository,
    private readonly properties: IPropertyRepository,
    private readonly profiles: IBookingMessagingProfileRepository,
    private readonly tokens: IMessagingContactTokenRepository,
    private readonly platformConnections: IPlatformMessagingConnectionRepository,
    private readonly opaqueTokens: IOpaqueTokenFactory,
    private readonly permissionChecker: PermissionChecker,
    private readonly ids: IIdGenerator,
  ) {}

  async execute(
    input: {
      tenantId: string;
      bookingId: string;
      systemActor?: boolean;
    },
    actor: ActorContext,
  ): Promise<
    Result<
      {
        deepLink: string;
        /** Returned once for explicit demo/test; never persist or log. */
        rawToken: string;
        expiresAt: Date;
        tokenId: string;
        tokenHash: string;
        displayPhoneDigits: string;
        bookingId: string;
        propertyId: string;
        propertyName: string;
        guestName: string;
        guestEmail: string | null;
        guestId: string | null;
      },
      Error
    >
  > {
    try {
      const booking = await this.bookings.findById(
        input.bookingId,
        input.tenantId,
      );
      if (!booking) {
        return Result.fail(new NotFoundError("Booking", input.bookingId));
      }
      if (
        !input.systemActor &&
        !canWriteMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          booking.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (booking.status !== "confirmed") {
        return Result.fail(
          new ValidationError("Booking must be confirmed for WhatsApp activation"),
        );
      }

      const property = await this.properties.findById(
        input.tenantId,
        booking.propertyId,
      );
      if (!property || property.deletedAt) {
        return Result.fail(new NotFoundError("Property", booking.propertyId));
      }

      let profile = await this.profiles.findByBookingId(
        input.tenantId,
        booking.id,
      );
      if (!profile) {
        const now = new Date();
        profile = await this.profiles.upsert({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          propertyId: booking.propertyId,
          bookingId: booking.id,
          guestId: booking.guestId,
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
          ...emptyWelcomeFields(),
          createdAt: now,
          updatedAt: now,
        });
      }

      const minted = await mintBookingWhatsAppActivationLink({
        tenantId: input.tenantId,
        booking,
        profile,
        revokeReason: "demo_activation_link",
        profiles: this.profiles,
        tokens: this.tokens,
        platformConnections: this.platformConnections,
        opaqueTokens: this.opaqueTokens,
        ids: this.ids,
      });

      if (!minted.ok) {
        return Result.fail(
          new ValidationError(
            "Central Talos WhatsApp PlatformMessagingConnection is missing a valid displayPhoneNumber (wa.me destination). Configure a connected platform WhatsApp connection with displayPhoneNumber in E.164; do not invent a number.",
          ),
        );
      }

      return Result.ok({
        deepLink: minted.deepLink,
        rawToken: minted.rawToken,
        expiresAt: minted.token.expiresAt,
        tokenId: minted.token.id,
        tokenHash: minted.token.tokenHash,
        displayPhoneDigits: minted.digits,
        bookingId: booking.id,
        propertyId: booking.propertyId,
        propertyName: property.name,
        guestName: booking.guest.name,
        guestEmail: resolveUsableGuestEmail(booking.guest.email),
        guestId: booking.guestId,
      });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

/**
 * Fire-and-forget safe hook after Booking confirmation (never fails the Booking).
 */
export class OnBookingConfirmedMessagingHook {
  constructor(private readonly welcome: SendBookingWelcomeEmailUseCase) {}

  async onConfirmed(params: {
    tenantId: string;
    bookingId: string;
    systemUserId: string;
  }): Promise<void> {
    try {
      await this.welcome.execute(
        {
          tenantId: params.tenantId,
          bookingId: params.bookingId,
          systemActor: true,
        },
        {
          userId: params.systemUserId,
          role: "admin",
          propertyIds: null,
          isSuperAdmin: true,
        },
      );
    } catch {
      // Never invalidate Booking on messaging failure.
    }
  }
}

export class RevokeBookingMessagingContactTokensUseCase {
  constructor(
    private readonly tokens: IMessagingContactTokenRepository,
    private readonly automationsCancel?: {
      cancelPendingArrival(tenantId: string, bookingId: string): Promise<number>;
    },
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tokens.revokeActiveForBooking(
      tenantId,
      bookingId,
      "booking_cancelled",
    );
    await this.automationsCancel?.cancelPendingArrival(tenantId, bookingId);
  }
}

export type ActivateContactTokenResult =
  | {
      outcome: "activated";
      profile: BookingMessagingProfileRecord;
      conversation: ConversationRecord;
      /** Guest message body with token redacted (safe for AI). */
      redactedBody: string;
    }
  | { outcome: "rejected" };

/**
 * First-contact: resolve opaque token → bind WhatsApp identity to Booking Conversation.
 * Invalid/expired/revoked/cancelled → rejected with no information disclosure.
 */
export class ActivateWhatsAppFromContactTokenUseCase {
  constructor(
    private readonly tokens: IMessagingContactTokenRepository,
    private readonly profiles: IBookingMessagingProfileRepository,
    private readonly conversations: IConversationRepository,
    private readonly bookings: IBookingRepository,
    private readonly identityRoutes: IMessagingWaIdentityRouteWriter,
    private readonly opaqueTokens: IOpaqueTokenFactory,
    private readonly ids: IIdGenerator,
  ) {}

  async execute(input: {
    rawMessageBody: string;
    senderWaId: string;
  }): Promise<ActivateContactTokenResult> {
    const rawToken = extractContactTokenFromText(input.rawMessageBody);
    if (!rawToken) {
      return { outcome: "rejected" };
    }

    const tokenHash = this.opaqueTokens.hash(rawToken);
    const token = await this.tokens.findByTokenHash(tokenHash);
    // Uniform rejection — do not distinguish missing vs invalid.
    if (!token || token.status !== "active") {
      return { outcome: "rejected" };
    }

    const now = new Date();
    if (token.expiresAt.getTime() <= now.getTime()) {
      await this.tokens.update(token.tenantId, token.id, {
        status: "expired",
        revokedAt: now,
        revokeReason: "expired",
      });
      return { outcome: "rejected" };
    }

    const booking = await this.bookings.findById(
      token.bookingId,
      token.tenantId,
    );
    if (!booking || booking.status === "cancelled") {
      await this.tokens.update(token.tenantId, token.id, {
        status: "revoked",
        revokedAt: now,
        revokeReason: "booking_ineligible",
      });
      return { outcome: "rejected" };
    }

    const identity = whatsappChannelIdentityFromSender(input.senderWaId);
    if (!identity) {
      return { outcome: "rejected" };
    }

    let profile = await this.profiles.findByBookingId(
      token.tenantId,
      token.bookingId,
    );
    if (!profile) {
      return { outcome: "rejected" };
    }

    let conversation: ConversationRecord | null = null;
    if (profile.conversationId) {
      conversation = await this.conversations.findById(
        token.tenantId,
        profile.conversationId,
      );
    }

    if (!conversation) {
      conversation = await this.conversations.create({
        id: this.ids.generate(),
        tenantId: token.tenantId,
        propertyId: token.propertyId,
        guestId: booking.guestId,
        bookingId: booking.id,
        channel: "whatsapp",
        externalThreadId: `wa:${identity}:${booking.id}`,
        guestChannelIdentity: identity,
        cswOpenUntil: extendCustomerServiceWindow(now),
        lastGuestInboundAt: now,
        routingStatus: "ok",
        status: "open",
        subject: `WhatsApp · ${booking.guest.name}`,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      conversation = await this.conversations.updateMeta(
        token.tenantId,
        conversation.id,
        {
          guestId: booking.guestId,
          bookingId: booking.id,
          guestChannelIdentity: identity,
          externalThreadId: `wa:${identity}:${booking.id}`,
          routingStatus: "ok",
          status:
            conversation.status === "archived" ? "open" : conversation.status,
          cswOpenUntil: extendCustomerServiceWindow(now),
          lastGuestInboundAt: now,
        },
      );
    }

    profile = await this.profiles.update(token.tenantId, profile.id, {
      conversationId: conversation.id,
      guestId: booking.guestId,
      guestChannelIdentity: identity,
      whatsappPhone: identity.startsWith("+") ? identity : `+${identity}`,
      whatsappPhoneNormalized: `+${identity}`,
      contactSource: "email_token",
      contactConfirmedAt: profile.contactConfirmedAt ?? now,
      messagingEnabled: true,
      identityStatus: "bound",
      cswOpenUntil: extendCustomerServiceWindow(now),
      lastGuestInboundAt: now,
      activeContactTokenId: token.id,
    });

    await this.identityRoutes.upsertRoute({
      guestChannelIdentity: identity,
      tenantId: token.tenantId,
      propertyId: token.propertyId,
      bookingId: booking.id,
      profileId: profile.id,
      conversationId: conversation.id,
      messagingEnabled: true,
    });

    await this.tokens.update(token.tenantId, token.id, {
      status: "activated",
      activatedAt: now,
      activatedConversationId: conversation.id,
      activatedWaIdentity: identity,
    });

    return {
      outcome: "activated",
      profile,
      conversation,
      redactedBody: redactContactTokensFromMessage(input.rawMessageBody),
    };
  }
}

export { extractContactTokenFromText, redactContactTokensFromMessage };
