import type {
  BookingMessagingProfileRecord,
  MessagingAutomationRunRecord,
  MessagingUnmatchedInboundRecord,
  PlatformMessagingConnectionRecord,
  PropertyMessagingSettingsRecord,
} from "../domain/WhatsAppMessagingTypes";
import type { ConversationRecord, MessageRecord } from "../domain/MessagingTypes";

export interface IPlatformMessagingConnectionRepository {
  findConnectedWhatsApp(): Promise<PlatformMessagingConnectionRecord | null>;
  findByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<PlatformMessagingConnectionRecord | null>;
  upsertConnected(input: PlatformMessagingConnectionRecord): Promise<PlatformMessagingConnectionRecord>;
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
  /** Free-form body (session messages only). */
  textBody?: string;
  templateName?: string;
  templateLanguage?: string;
  /** Ordered template body parameters. */
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
