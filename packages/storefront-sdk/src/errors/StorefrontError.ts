import type { ApiErrorBody } from "../types/index.js";

export class StorefrontError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ApiErrorBody["details"];

  constructor(code: string, message: string, status = 400, details?: ApiErrorBody["details"]) {
    super(message);
    this.name = "StorefrontError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static fromApiError(error: ApiErrorBody, status = 400): StorefrontError {
    return new StorefrontError(error.code, error.message, status, error.details);
  }
}

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  DOMAIN_NOT_ALLOWED: "DOMAIN_NOT_ALLOWED",
  NOT_FOUND: "NOT_FOUND",
  AVAILABILITY_UNAVAILABLE: "AVAILABILITY_UNAVAILABLE",
  HOLD_CONFLICT: "HOLD_CONFLICT",
  HOLD_EXPIRED: "HOLD_EXPIRED",
  QUOTE_EXPIRED: "QUOTE_EXPIRED",
  RATE_LIMITED: "RATE_LIMITED",
} as const;
