/**
 * WhatsApp / Booking-driven messaging — persistence-shaped types (V1).
 */

import type { WelcomeEmailStatus } from "./ContactToken";
export type { WelcomeEmailStatus } from "./ContactToken";

export const PLATFORM_MESSAGING_CONNECTION_STATUSES = [
  "draft",
  "connected",
  "disconnected",
  "error",
] as const;
export type PlatformMessagingConnectionStatus =
  (typeof PLATFORM_MESSAGING_CONNECTION_STATUSES)[number];

export const BOOKING_MESSAGING_CONTACT_SOURCES = [
  "manual",
  "snapshot_prefill",
  "crm_prefill",
  "email_token",
] as const;
export type BookingMessagingContactSource =
  (typeof BOOKING_MESSAGING_CONTACT_SOURCES)[number];

export const BOOKING_MESSAGING_IDENTITY_STATUSES = [
  "unbound",
  "bound",
  "ambiguous",
  "orphaned_inbound",
] as const;
export type BookingMessagingIdentityStatus =
  (typeof BOOKING_MESSAGING_IDENTITY_STATUSES)[number];

export const CONVERSATION_ROUTING_STATUSES = [
  "ok",
  "ambiguous",
  "unmatched",
] as const;
export type ConversationRoutingStatus =
  (typeof CONVERSATION_ROUTING_STATUSES)[number];

export const MESSAGING_AUTOMATION_TRIGGERS = [
  "welcome",
  "arrival",
  "confirmed",
  "during_stay",
  "checkout",
  "post_stay",
] as const;
export type MessagingAutomationTrigger =
  (typeof MESSAGING_AUTOMATION_TRIGGERS)[number];

export const MESSAGING_AUTOMATION_STATUSES = [
  "scheduled",
  "enqueued",
  "sending",
  "sent",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type MessagingAutomationStatus =
  (typeof MESSAGING_AUTOMATION_STATUSES)[number];

export const ARRIVAL_TIMING_MODES = [
  "check_in_local_time",
  "days_before_check_in",
  "hours_before_check_in",
] as const;
export type ArrivalTimingMode = (typeof ARRIVAL_TIMING_MODES)[number];

export interface PlatformMessagingConnectionRecord {
  id: string;
  channel: "whatsapp";
  provider: string;
  externalAccountId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  credentialRef: string | null;
  webhookVerificationRef: string | null;
  status: PlatformMessagingConnectionStatus;
  configJson: Record<string, unknown>;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyMessagingSettingsRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  whatsappEnabled: boolean;
  /** Primary V1 workerless Welcome Email activation. */
  welcomeEmailEnabled: boolean;
  /** Future Meta template welcome (worker-dependent). */
  welcomeEnabled: boolean;
  welcomeTemplateName: string | null;
  welcomeTemplateLanguage: string;
  /** Future Arrival automation (worker-dependent). */
  arrivalEnabled: boolean;
  arrivalTemplateName: string | null;
  arrivalTemplateLanguage: string;
  arrivalTimingMode: ArrivalTimingMode;
  arrivalLocalTime: string;
  arrivalOffsetDays: number;
  arrivalOffsetHours: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingMessagingProfileRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  guestId: string | null;
  conversationId: string | null;
  whatsappPhone: string | null;
  whatsappPhoneNormalized: string | null;
  guestChannelIdentity: string | null;
  contactSource: BookingMessagingContactSource;
  contactConfirmedAt: Date | null;
  messagingEnabled: boolean;
  identityStatus: BookingMessagingIdentityStatus;
  cswOpenUntil: Date | null;
  lastGuestInboundAt: Date | null;
  welcomeEmailStatus: WelcomeEmailStatus;
  welcomeEmailTo: string | null;
  welcomeEmailSentAt: Date | null;
  welcomeEmailLastError: string | null;
  welcomeEmailOccurrenceKey: string | null;
  activeContactTokenId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessagingAutomationRunRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  conversationId: string | null;
  trigger: MessagingAutomationTrigger;
  occurrenceKey: string;
  status: MessagingAutomationStatus;
  scheduledFor: Date | null;
  messageId: string | null;
  jobId: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface MessagingUnmatchedInboundRecord {
  id: string;
  platformConnectionId: string;
  guestChannelIdentity: string;
  externalMessageId: string;
  bodyPreview: string | null;
  rawMetaJson: Record<string, unknown>;
  status: "open" | "resolved" | "ignored";
  createdAt: Date;
}

/** CSW duration used across WhatsApp session messaging. */
export const WHATSAPP_CSW_MS = 24 * 60 * 60 * 1000;

export function isCustomerServiceWindowOpen(
  cswOpenUntil: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!cswOpenUntil) return false;
  return cswOpenUntil.getTime() > now.getTime();
}

export function extendCustomerServiceWindow(
  from: Date = new Date(),
): Date {
  return new Date(from.getTime() + WHATSAPP_CSW_MS);
}

/**
 * Normalize WhatsApp destination for matching / Meta `to` field.
 * Requires leading + and 8–15 digits after country code — does not invent country.
 */
export function normalizeWhatsAppE164(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("+")) return null;
  const digits = trimmed.slice(1).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Match key used for inbound routing (digits only, no +). */
export function whatsappChannelIdentityFromE164(e164: string): string {
  return e164.replace(/\D/g, "");
}

export function whatsappChannelIdentityFromSender(
  from: string | null | undefined,
): string | null {
  if (from == null) return null;
  const digits = from.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
