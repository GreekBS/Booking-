import type { ChannelIngressOrchestrationResult } from "../types/ChannelIngressOrchestrationTypes";
import type { ChannelWebhookRequestMeta } from "../types/ChannelWebhookTransportTypes";
import type { ChannelWebhookTransportRequest } from "../types/ChannelWebhookTransportRequest";
import type {
  ChannelWebhookRetryClassification,
  ChannelWebhookTransportFailureKind,
  ChannelWebhookTransportResult,
} from "../types/ChannelWebhookTransportResult";
import { decodeUtf8Bytes } from "../../shared/kernel/Utf8Bytes";

const CREDENTIAL_UNAVAILABLE_MESSAGES = new Set([
  "Webhook verification reference is required",
  "Credential reference is required",
]);

const SENSITIVE_PATTERNS = [
  /secret/i,
  /password/i,
  /authorization/i,
  /bearer\s+/i,
  /whsec_/i,
  /credential/i,
  /signature/i,
];

export function toWebhookRequestMeta(request: ChannelWebhookTransportRequest): ChannelWebhookRequestMeta {
  return {
    headers: { ...request.headers },
    rawBodyBytes: request.rawBodyBytes.slice(),
    rawBody: decodeUtf8Body(request.rawBodyBytes),
  };
}

export function decodeUtf8Body(bytes: Uint8Array): string {
  return decodeUtf8Bytes(bytes);
}

export function mapOrchestrationToTransportResult(
  orchestration: ChannelIngressOrchestrationResult,
): ChannelWebhookTransportResult {
  const receivedMessageCount = orchestration.results.length;
  const persistedMessageCount = orchestration.results.filter(
    (result) => result.success && !result.deduplicated,
  ).length;

  if (orchestration.ackAllowed) {
    return {
      ackAllowed: true,
      ackClassification: "ack_allowed",
      retryClassification: "none",
      results: orchestration.results,
      receivedMessageCount,
      persistedMessageCount,
    };
  }

  if (orchestration.failurePhase) {
    const failureKind = mapFailurePhaseToKind(
      orchestration.failurePhase,
      orchestration.errorMessage,
    );
    return {
      ackAllowed: false,
      ackClassification: "ack_denied",
      failureKind,
      failurePhase: orchestration.failurePhase,
      retryClassification: retryClassificationForFailure(failureKind),
      errorMessage: sanitizeTransportErrorMessage(orchestration.errorMessage),
      results: orchestration.results,
      receivedMessageCount,
      persistedMessageCount,
    };
  }

  return {
    ackAllowed: false,
    ackClassification: "ack_denied",
    failureKind: "receive_failed",
    retryClassification: "provider_retry",
    errorMessage: sanitizeTransportErrorMessage(
      orchestration.results.find((result) => !result.success)?.errorMessage ??
        "One or more events failed durable Receive",
    ),
    results: orchestration.results,
    receivedMessageCount,
    persistedMessageCount,
  };
}

export function mapThrownErrorToTransportResult(error: unknown): ChannelWebhookTransportResult {
  const message = error instanceof Error ? error.message : String(error);
  const failureKind: ChannelWebhookTransportFailureKind = isCredentialResolutionError(message)
    ? "credential_resolution_failed"
    : "internal_error";

  return {
    ackAllowed: false,
    ackClassification: "ack_denied",
    failureKind,
    retryClassification: failureKind === "internal_error" ? "transient" : "none",
    errorMessage: sanitizeTransportErrorMessage(message),
    results: [],
    receivedMessageCount: 0,
    persistedMessageCount: 0,
  };
}

function mapFailurePhaseToKind(
  phase: NonNullable<ChannelIngressOrchestrationResult["failurePhase"]>,
  errorMessage?: string,
): ChannelWebhookTransportFailureKind {
  switch (phase) {
    case "provider_registration":
      return "unsupported_provider";
    case "connection":
      return mapConnectionFailureKind(errorMessage);
    case "verify":
      return "verification_failed";
    case "parse":
      return "parse_failed";
    case "provenance":
      return "provenance_mismatch";
    case "malformed":
      return "malformed_identity";
    case "poll":
      return "internal_error";
    default:
      return "internal_error";
  }
}

function mapConnectionFailureKind(errorMessage?: string): ChannelWebhookTransportFailureKind {
  if (errorMessage === "not_found") {
    return "invalid_connection";
  }
  if (errorMessage === "not_active") {
    return "inactive_connection";
  }
  if (errorMessage === "provider_mismatch") {
    return "provider_mismatch";
  }
  if (errorMessage && CREDENTIAL_UNAVAILABLE_MESSAGES.has(errorMessage)) {
    return "credential_unavailable";
  }
  if (errorMessage && isCredentialResolutionError(errorMessage)) {
    return "credential_resolution_failed";
  }
  return "invalid_connection";
}

function retryClassificationForFailure(
  failureKind: ChannelWebhookTransportFailureKind,
): ChannelWebhookRetryClassification {
  switch (failureKind) {
    case "receive_failed":
      return "provider_retry";
    case "internal_error":
    case "credential_resolution_failed":
      return "transient";
    default:
      return "none";
  }
}

function isCredentialResolutionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to resolve") ||
    (normalized.includes("credential") &&
      (normalized.includes("resolve") ||
        normalized.includes("unavailable") ||
        normalized.includes("not found")))
  );
}

export function sanitizeTransportErrorMessage(message?: string): string | undefined {
  if (!message) {
    return undefined;
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(message)) {
      return "Transport processing failed";
    }
  }

  return message;
}
