/**
 * Opaque Guest Messaging contact tokens + Welcome Email helpers (client-safe).
 * Cryptographic generate/hash live behind IOpaqueTokenFactory (server-only).
 */

import {
  isUsableEmailNormalized,
  normalizeEmail,
} from "../../guests/domain/guestNormalization";

export const CONTACT_TOKEN_PREFIX = "tlsc_";

/** Machine-readable token embedded in WhatsApp prefill / inbound text. */
export const CONTACT_TOKEN_IN_TEXT_RE = /\btlsc_[A-Za-z0-9_-]{40,80}\b/g;

export const WELCOME_EMAIL_OCCURRENCE_KEY = "welcome_email:v1";

export const WELCOME_EMAIL_STATUSES = [
  "none",
  "unavailable",
  "pending",
  "sent",
  "failed",
] as const;
export type WelcomeEmailStatus = (typeof WELCOME_EMAIL_STATUSES)[number];

export const MESSAGING_CONTACT_TOKEN_STATUSES = [
  "active",
  "activated",
  "revoked",
  "expired",
] as const;
export type MessagingContactTokenStatus =
  (typeof MESSAGING_CONTACT_TOKEN_STATUSES)[number];

export interface MessagingContactTokenRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  guestId: string | null;
  profileId: string | null;
  tokenHash: string;
  status: MessagingContactTokenStatus;
  expiresAt: Date;
  activatedAt: Date | null;
  activatedConversationId: string | null;
  activatedWaIdentity: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function extractContactTokenFromText(body: string): string | null {
  CONTACT_TOKEN_IN_TEXT_RE.lastIndex = 0;
  const match = body.match(CONTACT_TOKEN_IN_TEXT_RE);
  return match?.[0] ?? null;
}

/** Strip opaque tokens before AI / operator-visible message persistence. */
export function redactContactTokensFromMessage(body: string): string {
  CONTACT_TOKEN_IN_TEXT_RE.lastIndex = 0;
  return body
    .replace(CONTACT_TOKEN_IN_TEXT_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Digits-only destination for https://wa.me/<digits>
 * Accepts E.164 (+…) or already-digit Meta display numbers.
 */
export function whatsappMeDigits(
  displayPhone: string | null | undefined,
): string | null {
  if (!displayPhone) return null;
  const digits = displayPhone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function buildWhatsAppDeepLink(params: {
  displayPhoneDigits: string;
  rawToken: string;
}): string {
  const text = `Hello, I would like assistance with my stay. ${params.rawToken}`;
  return `https://wa.me/${params.displayPhoneDigits}?text=${encodeURIComponent(text)}`;
}

/**
 * Usable until shortly after checkout, with a minimum window so late first-contact works.
 */
export function computeContactTokenExpiresAt(params: {
  checkOutDate: string;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  const checkoutEnd = new Date(`${params.checkOutDate}T23:59:59.000Z`);
  const afterStay = new Date(checkoutEnd.getTime() + 2 * 24 * 60 * 60 * 1000);
  const minWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const maxWindow = new Date(checkoutEnd.getTime() + 14 * 24 * 60 * 60 * 1000);
  const preferred =
    afterStay.getTime() > minWindow.getTime() ? afterStay : minWindow;
  return preferred.getTime() > maxWindow.getTime() ? maxWindow : preferred;
}

export function resolveUsableGuestEmail(
  raw: string | null | undefined,
): string | null {
  const normalized = normalizeEmail(raw);
  if (!isUsableEmailNormalized(normalized)) return null;
  return normalized;
}

/** Build opaque contact token from a high-entropy body (hex/base64url). */
export function wrapContactTokenBody(body: string): string {
  const cleaned = body.trim();
  if (cleaned.startsWith(CONTACT_TOKEN_PREFIX)) return cleaned;
  return `${CONTACT_TOKEN_PREFIX}${cleaned}`;
}
