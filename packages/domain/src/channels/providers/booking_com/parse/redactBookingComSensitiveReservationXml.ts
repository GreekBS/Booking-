/**
 * Strip payment/VCC card material from Booking.com reservation XML before durable
 * inbox persistence. Guest names and stay identity fields are retained for operations.
 *
 * Does not invent protocol versions — only removes known card-bearing elements/attrs.
 * PCI certification is NOT claimed; this is a defensive V1 boundary.
 */

const PAYMENT_CARD_BLOCK =
  /<(?:\w+:)?PaymentCard\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?PaymentCard>)/gi;

const CARD_NUMBER_BLOCK =
  /<(?:\w+:)?CardNumber\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?CardNumber>)/gi;

const SERIES_CODE_BLOCK =
  /<(?:\w+:)?SeriesCode\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?SeriesCode>)/gi;

const VCC_HINT_BLOCK =
  /<(?:\w+:)?(?:VirtualCreditCard|VCC|PaymentCardInfo)\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?(?:VirtualCreditCard|VCC|PaymentCardInfo)>)/gi;

const SENSITIVE_ATTRS =
  /\s(?:CardNumber|SeriesCode|CVV|CVC|ExpireDate|EncryptionKey)\s*=\s*"[^"]*"/gi;

export function redactBookingComSensitiveReservationXml(rawXml: string): string {
  if (typeof rawXml !== "string" || rawXml.length === 0) {
    return rawXml;
  }
  return rawXml
    .replace(PAYMENT_CARD_BLOCK, "<!--REDACTED:PaymentCard-->")
    .replace(CARD_NUMBER_BLOCK, "<!--REDACTED:CardNumber-->")
    .replace(SERIES_CODE_BLOCK, "<!--REDACTED:SeriesCode-->")
    .replace(VCC_HINT_BLOCK, "<!--REDACTED:VCC-->")
    .replace(SENSITIVE_ATTRS, "");
}

/** True when redaction removed at least one payment/card fragment. */
export function bookingComXmlContainedPaymentMaterial(rawXml: string): boolean {
  if (typeof rawXml !== "string" || rawXml.length === 0) return false;
  return redactBookingComSensitiveReservationXml(rawXml) !== rawXml;
}
