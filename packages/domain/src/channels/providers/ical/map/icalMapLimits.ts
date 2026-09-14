/** Provider-1 P1-S4a — hard resource limits (fail closed). */

export const ICAL_MAP_LIMITS = {
  maxEntries: 5_000,
  maxGroups: 5_000,
  maxTotalDigests: 5_000,
  maxHashesPerGroup: 5_000,

  maxDirectUidUtf8Bytes: 128,
  /** Complete TemporalEncodingV1 byte length including tag and length prefixes. */
  maxDirectTemporalIdentityBytes: 96,
  maxIdentityBinaryBytes: 243,
  maxIdentityBase64urlBytes: 324,

  maxCursorPayloadUtf8Bytes: 2_621_440,

  maxSecondaryReasonCodes: 8,
  maxMapIssues: 256,
  maxJsonDepth: 4,

  hashHexLength: 64,
  sha256DigestBytes: 32,
} as const;

export type IcalMapLimitKey = keyof typeof ICAL_MAP_LIMITS;
