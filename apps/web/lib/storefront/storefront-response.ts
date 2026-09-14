import { NextResponse } from "next/server";
import { DomainError } from "@hcp/domain";
import type { ApiErrorBody, ApiMeta } from "@hcp/storefront-sdk";
import type { StorefrontContext } from "@hcp/domain";

export function storefrontSuccess<T>(
  ctx: StorefrontContext,
  data: T,
  status = 200,
): NextResponse {
  return NextResponse.json(
    {
      data,
      error: null,
      meta: {
        requestId: ctx.requestId,
        locale: ctx.locale,
      } satisfies ApiMeta,
    },
    { status },
  );
}

export function storefrontError(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      VALIDATION_ERROR: 400,
      CONFLICT: 409,
      FORBIDDEN: 403,
      UNAUTHORIZED: 401,
    };

    const codeMap: Record<string, string> = {
      NOT_FOUND: "NOT_FOUND",
      VALIDATION_ERROR: "VALIDATION_ERROR",
      CONFLICT: "HOLD_CONFLICT",
      FORBIDDEN: "DOMAIN_NOT_ALLOWED",
      UNAUTHORIZED: "UNAUTHORIZED",
    };

    const status = statusMap[error.code] ?? 400;
    const message =
      error.code === "FORBIDDEN" && error.message.includes("Rate limit")
        ? "Rate limit exceeded"
        : error.message;

    const code =
      message === "Rate limit exceeded"
        ? "RATE_LIMITED"
        : error.code === "FORBIDDEN" && message.toLowerCase().includes("domain")
          ? "DOMAIN_NOT_ALLOWED"
          : error.code === "CONFLICT"
            ? "HOLD_CONFLICT"
            : error.code === "VALIDATION_ERROR" &&
                message.toLowerCase().includes("not available")
              ? "AVAILABILITY_UNAVAILABLE"
              : (codeMap[error.code] ?? error.code);

    return NextResponse.json(
      {
        data: null,
        error: {
          code,
          message,
        } satisfies ApiErrorBody,
        meta: {
          requestId: "",
          locale: "en-US",
        },
      },
      { status: status === 400 && code === "RATE_LIMITED" ? 429 : status },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message: error.message,
        },
        meta: { requestId: "", locale: "en-US" },
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Unknown error" },
      meta: { requestId: "", locale: "en-US" },
    },
    { status: 500 },
  );
}

export function mapStorefrontResultError(error: Error): NextResponse {
  return storefrontError(error);
}
