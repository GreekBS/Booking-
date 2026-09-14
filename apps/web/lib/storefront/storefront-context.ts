import { randomUUID } from "node:crypto";
import { UnauthorizedError, ForbiddenError, ValidationError } from "@hcp/domain";
import { publishableKeySchema } from "@hcp/storefront-sdk";
import type { StorefrontContext } from "@hcp/domain";
import { hashToken, publishableKeyRepository } from "@/lib/di/container";

export function isAllowedOrigin(origin: string, allowlist: string[]): boolean {
  if (allowlist.includes("*")) {
    return true;
  }

  return allowlist.some((allowed) => {
    if (allowed.startsWith("*.")) {
      const suffix = allowed.slice(1);
      try {
        const host = new URL(origin).hostname;
        return host.endsWith(suffix) || host === allowed.slice(2);
      } catch {
        return false;
      }
    }
    return origin === allowed || origin === `https://${allowed}` || origin === `http://${allowed}`;
  });
}

function resolveRequestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Publishable key required");
  }

  const token = header.slice("Bearer ".length).trim();
  publishableKeySchema.parse(token);
  return token;
}

export async function requireStorefrontContext(request: Request): Promise<StorefrontContext> {
  const rawKey = extractBearerToken(request);
  const keyRecord = await publishableKeyRepository.findByKeyHash(hashToken(rawKey));

  if (!keyRecord) {
    throw new UnauthorizedError("Invalid publishable key");
  }

  const origin = resolveRequestOrigin(request);
  if (origin && keyRecord.allowedDomains.length > 0) {
    if (!isAllowedOrigin(origin, keyRecord.allowedDomains)) {
      throw new ForbiddenError("Domain not allowed");
    }
  }

  if (origin && keyRecord.allowedDomains.length === 0 && keyRecord.environment === "live") {
    throw new ForbiddenError("Domain not allowed");
  }

  const locale = request.headers.get("x-hcp-locale") ?? "en-US";

  return {
    tenantId: keyRecord.tenantId,
    publishableKeyId: keyRecord.id,
    environment: keyRecord.environment,
    allowedDomains: keyRecord.allowedDomains,
    locale,
    requestId: randomUUID(),
  };
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key?.trim()) {
    throw new ValidationError("Idempotency-Key header is required");
  }
  return key.trim();
}
