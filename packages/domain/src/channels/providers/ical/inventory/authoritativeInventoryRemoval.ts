/**
 * P1-S7a — helpers for authoritative same-epoch inventory soft-removal.
 */

export interface AuthoritativeObservedEvidence {
  readonly completeObservedEvidence: true;
  readonly observedSourceIdentityKeys: readonly string[];
  readonly cancelledSourceIdentityKeys: readonly string[];
}

export type ParsedObservedEvidence =
  | AuthoritativeObservedEvidence
  | { readonly completeObservedEvidence: false };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Parse durable generation evidence. Incomplete/malformed → fail closed (no absence remove).
 */
export function parseAuthoritativeObservedEvidence(input: {
  readonly completeObservedEvidence?: unknown;
  readonly observedSourceIdentityKeys?: unknown;
  readonly cancelledSourceIdentityKeys?: unknown;
}): ParsedObservedEvidence {
  if (input.completeObservedEvidence !== true) {
    return { completeObservedEvidence: false };
  }
  if (
    !isStringArray(input.observedSourceIdentityKeys) ||
    !isStringArray(input.cancelledSourceIdentityKeys)
  ) {
    return { completeObservedEvidence: false };
  }
  return {
    completeObservedEvidence: true,
    observedSourceIdentityKeys: input.observedSourceIdentityKeys,
    cancelledSourceIdentityKeys: input.cancelledSourceIdentityKeys,
  };
}

/**
 * Soft-release when identity is absent from observed set OR explicitly CANCELLED.
 * Never infer cancellation from actionable absence alone.
 */
export function shouldReleaseProviderIdentity(
  sourceIdentityKey: string,
  evidence: AuthoritativeObservedEvidence,
): boolean {
  const observed = new Set(evidence.observedSourceIdentityKeys);
  const cancelled = new Set(evidence.cancelledSourceIdentityKeys);
  return !observed.has(sourceIdentityKey) || cancelled.has(sourceIdentityKey);
}
