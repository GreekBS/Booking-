import { randomUUID } from "node:crypto";
import { UnauthorizedError, ForbiddenError } from "@hcp/domain";
import type { DirectBookingIntegrationPublicLookup } from "@hcp/domain";
import { directBookingPublicKeySchema } from "@hcp/validators";
import {
  directBookingIntegrationRepository,
  hashToken,
} from "@/lib/di/container";
import { isAllowedOrigin } from "@/lib/storefront/storefront-context";

export interface DirectBookingRequestContext {
  integration: DirectBookingIntegrationPublicLookup;
  requestId: string;
  locale: string;
  origin: string | null;
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
    throw new UnauthorizedError("Direct Booking public key required");
  }

  const token = header.slice("Bearer ".length).trim();
  directBookingPublicKeySchema.parse(token);
  return token;
}

export async function requireDirectBookingContext(
  request: Request,
): Promise<DirectBookingRequestContext> {
  const rawKey = extractBearerToken(request);
  const integration = await directBookingIntegrationRepository.findByPublicKeyHash(
    hashToken(rawKey),
  );

  if (!integration) {
    throw new UnauthorizedError("Invalid Direct Booking public key");
  }

  const origin = resolveRequestOrigin(request);
  if (origin && integration.allowedOrigins.length > 0) {
    if (!isAllowedOrigin(origin, integration.allowedOrigins)) {
      throw new ForbiddenError("Origin not allowed");
    }
  }

  if (
    origin &&
    integration.allowedOrigins.length === 0 &&
    integration.environment === "live"
  ) {
    throw new ForbiddenError("Origin not allowed");
  }

  // Server-to-server BFF calls may omit Origin; allowed when no browser origin.
  // Live keys still require an allowlist when Origin is present.

  return {
    integration,
    requestId: randomUUID(),
    locale: request.headers.get("x-talos-locale") ?? "el",
    origin,
  };
}
