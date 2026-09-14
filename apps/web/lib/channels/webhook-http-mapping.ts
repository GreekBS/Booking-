import type { ChannelWebhookTransportResult } from "@hcp/domain";
import { NextResponse } from "next/server";

function genericBody(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

/**
 * Map ChannelWebhookTransportResult to HTTP without leaking internals.
 * ACK only when ackAllowed === true.
 */
export function mapWebhookTransportResultToHttp(
  result: ChannelWebhookTransportResult,
): NextResponse {
  if (result.ackAllowed) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  switch (result.failureKind) {
    case "verification_failed":
    case "credential_unavailable":
      return NextResponse.json(genericBody("UNAUTHORIZED", "Unauthorized"), {
        status: 401,
      });
    case "parse_failed":
    case "malformed_identity":
    case "provenance_mismatch":
      return NextResponse.json(genericBody("BAD_REQUEST", "Bad request"), {
        status: 400,
      });
    case "unsupported_provider":
    case "invalid_connection":
    case "provider_mismatch":
      return NextResponse.json(genericBody("NOT_FOUND", "Not found"), {
        status: 404,
      });
    case "inactive_connection":
      return NextResponse.json(genericBody("CONFLICT", "Conflict"), {
        status: 409,
      });
    case "credential_resolution_failed":
    case "receive_failed":
      return NextResponse.json(
        genericBody("SERVICE_UNAVAILABLE", "Service unavailable"),
        { status: 503 },
      );
    case "internal_error":
    default:
      if (result.retryClassification === "transient" || result.retryClassification === "provider_retry") {
        return NextResponse.json(
          genericBody("SERVICE_UNAVAILABLE", "Service unavailable"),
          { status: 503 },
        );
      }
      return NextResponse.json(
        genericBody("INTERNAL_ERROR", "Internal error"),
        { status: 500 },
      );
  }
}
