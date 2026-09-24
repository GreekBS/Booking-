export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "OTA" | "OTHER";

export type CollectionSource =
  | "DIRECT"
  | "PROPERTY"
  | "OTA"
  | "PAYMENT_GATEWAY"
  | "OTHER";

export type RefundStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
