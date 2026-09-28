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

      const connection = await this.platformConnections.findConnectedWhatsApp();
      const digits = whatsappMeDigits(connection?.displayPhoneNumber ?? null);
      if (!digits) {
        profile = await this.profiles.update(input.tenantId, profile.id, {
          welcomeEmailStatus: "failed",
          welcomeEmailTo: email,
          welcomeEmailLastError: "whatsapp_display_number_missing",
          welcomeEmailOccurrenceKey: WELCOME_EMAIL_OCCURRENCE_KEY,
        });
        return Result.ok({ profile, sent: false, status: "failed" });
      }

      const property = await this.properties.findById(
        input.tenantId,
        booking.propertyId,
      );

      await this.tokens.revokeActiveForBooking(
        input.tenantId,
        booking.id,
        input.manualResend ? "manual_resend" : "reissue",
      );

      const material = this.opaqueTokens.create();
      const rawToken = wrapContactTokenBody(material.token);
      const tokenHash = this.opaqueTokens.hash(rawToken);
      const now = new Date();
      const token: MessagingContactTokenRecord = {
        id: this.ids.generate(),
        tenantId: input.tenantId,
        propertyId: booking.propertyId,
        bookingId: booking.id,
        guestId: booking.guestId,
        profileId: profile.id,
        tokenHash,
        status: "active",
        expiresAt: computeContactTokenExpiresAt({
          checkOutDate: booking.stayPeriod.checkOut.value,
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
      await this.tokens.create(token);

      profile = await this.profiles.update(input.tenantId, profile.id, {
        activeContactTokenId: token.id,
        welcomeEmailStatus: "pending",
        welcomeEmailTo: email,
        welcomeEmailLastError: null,
        welcomeEmailOccurrenceKey: WELCOME_EMAIL_OCCURRENCE_KEY,
      });

      const deepLink = buildWhatsAppDeepLink({
        displayPhoneDigits: digits,
        rawToken,
      });

      try {
        await this.emailSender.sendWelcome({
          to: email,
          propertyName: property?.name ?? "Your stay",
          guestName: booking.guest.name || null,
          checkIn: booking.stayPeriod.checkIn.value,
          checkOut: booking.stayPeriod.checkOut.value,
          whatsappDeepLink: deepLink,
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
        // Token remains active so a later resend/retry can reuse after rotation.
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
          // Never log raw token. Email domain only.
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
