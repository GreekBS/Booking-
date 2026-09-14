/** Provider-1 P1-S3 — hard resource limits (fail closed). */

export const ICAL_PARSE_LIMITS = {
  maxInputBytes: 2 * 1024 * 1024,
  maxPhysicalLineBytes: 8 * 1024,
  maxPhysicalLines: 100_000,
  maxLogicalLines: 100_000,
  maxLogicalLineUtf16Length: 8 * 1024,
  maxPropertyValueUtf16Length: 8 * 1024,
  maxTotalProperties: 50_000,
  maxTotalComponents: 10_000,
  maxNestingDepth: 8,
  maxRootVeventCount: 5_000,
  maxParamsPerProperty: 32,
  maxValuesPerParameter: 64,
  maxNameUtf16Length: 256,
  maxAggregateParamValuesUtf16Length: 4 * 1024,
} as const;

export type IcalParseLimitKey = keyof typeof ICAL_PARSE_LIMITS;
