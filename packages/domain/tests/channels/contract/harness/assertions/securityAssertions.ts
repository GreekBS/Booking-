import { expect } from "vitest";

const SENSITIVE_PATTERNS = [
  /secret/i,
  /password/i,
  /authorization/i,
  /bearer\s+/i,
  /whsec_/i,
  /credential/i,
  /signature/i,
];

export function assertNoSecretLeakage(value: string | undefined): void {
  if (!value) {
    return;
  }
  for (const pattern of SENSITIVE_PATTERNS) {
    expect(pattern.test(value), `Sensitive pattern leaked: ${pattern}`).toBe(false);
  }
}

export function assertDtoHasNoCredentialFields(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    expect(key.toLowerCase()).not.toMatch(/secret|password|credential|authorization|token/);
  }
}

export function assertJobPayloadHasNoCredentials(job: { payload?: Record<string, unknown> }): void {
  const serialized = JSON.stringify(job.payload ?? {});
  assertNoSecretLeakage(serialized);
}

export function assertInboxPayloadHasNoCredentials(rawPayload: Record<string, unknown>): void {
  const serialized = JSON.stringify(rawPayload);
  assertNoSecretLeakage(serialized);
}
