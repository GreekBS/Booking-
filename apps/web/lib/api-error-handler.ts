import { NextResponse } from "next/server";
import { DomainError } from "@hcp/domain";
import { ZodError } from "zod";
import { RateLimitedError } from "@/lib/channels/channel-transport-rate-limit";
import { WebhookPayloadTooLargeError } from "@/lib/channels/webhook-raw-body";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: error.errors[0]?.message ?? "Validation failed",
          details: { issues: error.errors },
        },
      } satisfies ApiErrorBody,
      { status: 400 },
    );
  }

  if (error instanceof RateLimitedError) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
        },
      } satisfies ApiErrorBody,
      { status: 429 },
    );
  }

  if (error instanceof WebhookPayloadTooLargeError) {
    return NextResponse.json(
      {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Payload too large",
        },
      } satisfies ApiErrorBody,
      { status: 413 },
    );
  }

  if (error instanceof DomainError) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      VALIDATION_ERROR: 400,
      CONFLICT: 409,
      IDEMPOTENCY_CONFLICT: 409,
      LAST_SUPER_ADMIN: 409,
      PLATFORM_ROLE_DRIFT: 409,
      FORBIDDEN: 403,
      UNAUTHORIZED: 401,
      PERSISTENCE_CORRUPTION: 500,
    };

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      } satisfies ApiErrorBody,
      { status: statusMap[error.code] ?? 400 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: error.message,
        },
      } satisfies ApiErrorBody,
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Unknown error",
      },
    } satisfies ApiErrorBody,
    { status: 500 },
  );
}

export function mapResultError(error: Error): NextResponse {
  return apiError(error);
}
