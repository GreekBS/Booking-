import { NextResponse } from "next/server";
import { DomainError } from "@hcp/domain";
import type { DirectBookingRequestContext } from "./direct-booking-context";

export function directBookingSuccess<T>(
  ctx: DirectBookingRequestContext,
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
      },
    },
    { status },
  );
}

export function directBookingError(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      VALIDATION_ERROR: 400,
      CONFLICT: 409,
      FORBIDDEN: 403,
      UNAUTHORIZED: 401,
    };

    let status = statusMap[error.code] ?? 400;
    let code = error.code;
    let message = error.message;

    if (message.toLowerCase().includes("rate limit")) {
      status = 429;
      code = "RATE_LIMITED";
      message = "Rate limit exceeded";
    } else if (error.code === "FORBIDDEN" && message.toLowerCase().includes("origin")) {
      code = "ORIGIN_NOT_ALLOWED";
      message = "Origin not allowed";
    } else if (error.code === "FORBIDDEN") {
      message = "Forbidden";
    } else if (error.code === "UNAUTHORIZED") {
      message = "Unauthorized";
    } else if (error.code === "NOT_FOUND") {
      message = "Not found";
    } else if (error.code === "CONFLICT") {
      const lower = message.toLowerCase();
      if (lower.includes("idempotency")) {
        code = "IDEMPOTENCY_CONFLICT";
        message = "Idempotency key conflict";
      } else if (lower.includes("expired")) {
        code = "HOLD_EXPIRED";
        message = "Hold has expired";
      } else {
        code = "HOLD_CONFLICT";
        message = "Dates no longer available";
      }
    } else if (error.code === "VALIDATION_ERROR") {
      if (message.toLowerCase().includes("not available")) {
        code = "UNAVAILABLE";
        message = "Stay is not available";
      } else if (message.toLowerCase().includes("direct booking not available")) {
        code = "NOT_BOOKABLE";
        message = "Direct Booking is not available for this property";
      } else if (message.toLowerCase().includes("rate plan")) {
        code = "NOT_BOOKABLE";
        message = "Pricing is not configured";
      } else if (message.toLowerCase().includes("guest")) {
        code = "GUEST_LIMIT";
        message = "Guest count is not allowed";
      } else if (message.toLowerCase().includes("terms")) {
        code = "TERMS_REQUIRED";
        message = "Terms must be accepted";
      } else {
        message = "Invalid request";
      }
    }

    return NextResponse.json(
      {
        data: null,
        error: { code, message },
        meta: { requestId: "", locale: "el" },
      },
      { status },
    );
  }

  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
    return NextResponse.json(
      {
        data: null,
        error: { code: "VALIDATION_ERROR", message: "Invalid request" },
        meta: { requestId: "", locale: "el" },
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Internal error" },
      meta: { requestId: "", locale: "el" },
    },
    { status: 500 },
  );
}

export function mapDirectBookingResultError(error: Error): NextResponse {
  return directBookingError(error);
}
