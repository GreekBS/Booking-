import type {
  BookingMessagingProfileRecord,
  MessagingAutomationRunRecord,
  MessagingUnmatchedInboundRecord,
  PlatformMessagingConnectionRecord,
  PropertyMessagingSettingsRecord,
} from "../domain/WhatsAppMessagingTypes";
import type { MessagingContactTokenRecord } from "../domain/ContactToken";
import type { ConversationRecord, MessageRecord } from "../domain/MessagingTypes";

export interface IPlatformMessagingConnectionRepository {
  findConnectedWhatsApp(): Promise<PlatformMessagingConnectionRecord | null>;
  findByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<PlatformMessagingConnectionRecord | null>;
  upsertConnected(
    input: PlatformMessagingConnectionRecord,
  ): Promise<PlatformMessagingConnectionRecord>;
}

export interface IMessagingSecretVault {
  putPlatformCredential(material: Record<string, string>): Promise<string>;
  putPlatformWebhookVerification(secret: string): Promise<string>;
  resolvePlatformCredential(ref: string): Promise<Record<string, string>>;
  resolvePlatformWebhookVerification(ref: string): Promise<string>;
}

export interface IPropertyMessagingSettingsRepository {
  get(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyMessagingSettingsRecord | null>;
  upsert(
    input: PropertyMessagingSettingsRecord,
  ): Promise<PropertyMessagingSettingsRecord>;
}

export interface IBookingMessagingProfileRepository {
  findByBookingId(
    tenantId: string,
    bookingId: string,
  ): Promise<BookingMessagingProfileRecord | null>;
  findEnabledByIdentity(
    guestChannelIdentity: string,
  ): Promise<BookingMessagingProfileRecord[]>;
  upsert(
    input: BookingMessagingProfileRecord,
  ): Promise<BookingMessagingProfileRecord>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<BookingMessagingProfileRecord>,
  ): Promise<BookingMessagingProfileRecord>;
}

export interface IMessagingContactTokenRepository {
  create(
    input: MessagingContactTokenRecord,
  ): Promise<MessagingContactTokenRecord>;
  findByTokenHash(
    tokenHash: string,
  ): Promise<MessagingContactTokenRecord | null>;
  findActiveByBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<MessagingContactTokenRecord | null>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<MessagingContactTokenRecord>,
  ): Promise<MessagingContactTokenRecord>;
  revokeActiveForBooking(
    tenantId: string,
    bookingId: string,
    reason: string,
  ): Promise<number>;
}

export interface IMessagingAutomationRunRepository {
  findByBookingTriggerOccurrence(
    tenantId: string,
    bookingId: string,
    trigger: string,
    occurrenceKey: string,
  ): Promise<MessagingAutomationRunRecord | null>;
  listByBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<MessagingAutomationRunRecord[]>;
  create(
    input: MessagingAutomationRunRecord,
  ): Promise<MessagingAutomationRunRecord>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<MessagingAutomationRunRecord>,
  ): Promise<MessagingAutomationRunRecord>;
  cancelPendingArrival(
    tenantId: string,
    bookingId: string,
  ): Promise<number>;
}

export interface IMessagingUnmatchedInboundRepository {
  create(
    input: MessagingUnmatchedInboundRecord,
  ): Promise<MessagingUnmatchedInboundRecord>;
  findByExternalMessageId(
    externalMessageId: string,
  ): Promise<MessagingUnmatchedInboundRecord | null>;
}

export interface WhatsAppOutboundSendRequest {
  kind: "template" | "text";
  phoneNumberId: string;
  accessToken: string;
  toE164: string;
  textBody?: string;
  templateName?: string;
  templateLanguage?: string;
  templateBodyParameters?: string[];
  clientMessageId: string;
}

export interface WhatsAppOutboundSendResult {
  success: boolean;
  externalMessageId: string | null;
  errorCode: string | null;
  httpStatus: number | null;
}

export interface IWhatsAppCloudApiAdapter {
  send(request: WhatsAppOutboundSendRequest): Promise<WhatsAppOutboundSendResult>;
  verifyWebhookSignature(params: {
    rawBody: Buffer;
    signatureHeader: string | null;
    appSecret: string;
  }): boolean;
}

/**
 * Workerless session reply: send free-form text inside an open CSW.
 * Uses the same PlatformMessagingConnection that received the inbound.
 */
export interface WhatsAppSessionReplyInput {
  tenantId: string;
  conversation: ConversationRecord;
  message: MessageRecord;
  /** Meta phone_number_id from the inbound webhook metadata. */
  phoneNumberId: string;
  /** Stable idempotency key for this outbound attempt (e.g. talos-out:<inboundId>). */
  clientMessageId: string;
}

export interface WhatsAppSessionReplyResult {
  message: MessageRecord;
  success: boolean;
  errorCode: string | null;
}

export interface IWhatsAppSessionReplySender {
  deliver(
    input: WhatsAppSessionReplyInput,
  ): Promise<WhatsAppSessionReplyResult>;
}

export type WhatsAppInboundRouteResult =
  | {
      outcome: "routed";
      profile: BookingMessagingProfileRecord;
      conversation: ConversationRecord;
    }
  | {
      outcome: "ambiguous";
      profiles: BookingMessagingProfileRecord[];
    }
  | {
      outcome: "unmatched";
    };

export interface IWhatsAppConversationLookup {
  findOpenWhatsAppByIdentity(
    tenantId: string,
    guestChannelIdentity: string,
  ): Promise<ConversationRecord[]>;
  findByExternalMessageId(
    tenantId: string,
    externalMessageId: string,
  ): Promise<MessageRecord | null>;
}

/** Synchronous guest Welcome Email transport (no BackgroundJob). */
export interface GuestWelcomeEmailPayload {
  to: string;
  propertyName: string;
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  whatsappDeepLink: string;
}

export interface IGuestWelcomeEmailSender {
  sendWelcome(payload: GuestWelcomeEmailPayload): Promise<void>;
}

export interface IMessagingWaIdentityRouteWriter {
  upsertRoute(input: {
    guestChannelIdentity: string;
    tenantId: string;
    propertyId: string;
    bookingId: string;
    profileId: string;
    conversationId: string | null;
    messagingEnabled: boolean;
  }): Promise<void>;
}
