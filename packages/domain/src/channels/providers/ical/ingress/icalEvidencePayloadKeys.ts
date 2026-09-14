/** Provider-local evidence payload keys for reservation.unknown (audit only — not dedup authority). */

export const ICAL_EVIDENCE_PAYLOAD_KEYS = {
  IDENTITY_KEY: "icalIdentityKey",
  CHANGE: "icalChange",
  ENTRY_CONTENT_HASH: "icalEntryContentHash",
  PREVIOUS_ENTRY_CONTENT_HASH: "icalPreviousEntryContentHash",
  EVIDENCE_KIND: "icalEvidenceKind",
  REASON_CODES: "icalReasonCodes",
  INTERVAL: "icalInterval",
  INGRESS_DEDUP_DIGEST_HEX: "icalIngressDedupDigestHex",
} as const;
