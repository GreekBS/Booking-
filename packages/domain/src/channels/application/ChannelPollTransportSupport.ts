import { ConflictError } from "../../shared/errors/DomainError";
import type { ReceiveChannelPollBatchResult } from "../types/ChannelIngressOrchestrationTypes";
import type { IChannelPollCursorRepository } from "../ports/IChannelPollCursorRepository";
import type {
  ChannelPollConnectionResult,
  ChannelPollReconciliation,
  ChannelPollRetryClassification,
  ChannelPollTransportFailureKind,
} from "../types/ChannelPollConnectionResult";
import { sanitizeTransportErrorMessage } from "./ChannelWebhookTransportSupport";

const CREDENTIAL_UNAVAILABLE_MESSAGES = new Set([
  "Webhook verification reference is required",
  "Credential reference is required",
]);

export function buildPollConnectionNotFoundResult(
  loadedCursorVersion: number,
): ChannelPollConnectionResult {
  return {
    ackAllowed: false,
    cursorAdvanced: false,
    cursorReconciliation: "not_applicable",
    failureKind: "invalid_connection",
    failurePhase: "connection",
    retryClassification: "none",
    shouldRetryJob: false,
    errorMessage: "not_found",
    results: [],
    receivedMessageCount: 0,
    persistedMessageCount: 0,
    proposedNextCursor: null,
    loadedCursorVersion,
    committedCursorVersion: null,
  };
}

export function mapBatchToPollConnectionResult(
  batch: ReceiveChannelPollBatchResult,
  loadedCursorVersion: number,
  cursorReconciliation: ChannelPollReconciliation,
  cursorAdvanced: boolean,
  shouldRetryJob: boolean,
  retryClassification: ChannelPollRetryClassification,
  committedCursorVersion: number | null = null,
): ChannelPollConnectionResult {
  const receivedMessageCount = batch.results.length;
  const persistedMessageCount = batch.results.filter(
    (result) => result.success && !result.deduplicated,
  ).length;

  if (batch.ackAllowed) {
    return {
      ackAllowed: true,
      cursorAdvanced,
      cursorReconciliation,
      retryClassification,
      shouldRetryJob,
      results: batch.results,
      receivedMessageCount,
      persistedMessageCount,
      proposedNextCursor: batch.proposedNextCursor,
      loadedCursorVersion,
      committedCursorVersion,
    };
  }

  const failureKind = batch.failurePhase
    ? mapFailurePhaseToKind(batch.failurePhase, batch.errorMessage)
    : "receive_failed";
  const resolvedRetryClassification = retryClassificationForFailure(failureKind);

  return {
    ackAllowed: false,
    cursorAdvanced: false,
    cursorReconciliation: "not_applicable",
    failureKind,
    failurePhase: batch.failurePhase,
    retryClassification: resolvedRetryClassification,
    shouldRetryJob: resolvedRetryClassification !== "none",
    errorMessage: sanitizeTransportErrorMessage(
      batch.errorMessage ??
        batch.results.find((result) => !result.success)?.errorMessage ??
        "One or more events failed durable Receive",
    ),
    results: batch.results,
    receivedMessageCount,
    persistedMessageCount,
    proposedNextCursor: batch.proposedNextCursor,
    loadedCursorVersion,
    committedCursorVersion: null,
  };
}

export async function advanceCursorWithReconciliation(params: {
  tenantId: string;
  connectionId: string;
  proposedNextCursor: string;
  observedSemanticConfigVersion: number;
  expectedCursorVersion: number;
  cursorRepository: IChannelPollCursorRepository;
  batch: ReceiveChannelPollBatchResult;
  loadedCursorVersion: number;
}): Promise<ChannelPollConnectionResult> {
  try {
    const advanced = await params.cursorRepository.advanceCursor({
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      observedSemanticConfigVersion: params.observedSemanticConfigVersion,
      expectedCursorVersion: params.expectedCursorVersion,
      nextPayload: params.proposedNextCursor,
    });
    return mapBatchToPollConnectionResult(
      params.batch,
      params.loadedCursorVersion,
      "advanced",
      true,
      false,
      "none",
      advanced.version,
    );
  } catch (error) {
    if (!(error instanceof ConflictError)) {
      throw error;
    }
  }

  const reloaded = await params.cursorRepository.getCursor(params.tenantId, params.connectionId);
  if (
    reloaded?.payload === params.proposedNextCursor &&
    reloaded.semanticConfigVersion === params.observedSemanticConfigVersion
  ) {
    return mapBatchToPollConnectionResult(
      params.batch,
      params.loadedCursorVersion,
      "already_committed",
      false,
      false,
      "none",
      reloaded.version,
    );
  }

  return mapBatchToPollConnectionResult(
    params.batch,
    params.loadedCursorVersion,
    "deferred_retry",
    false,
    true,
    "transient",
    null,
  );
}

function mapFailurePhaseToKind(
  phase: NonNullable<ReceiveChannelPollBatchResult["failurePhase"]>,
  errorMessage?: string,
): ChannelPollTransportFailureKind {
  switch (phase) {
    case "provider_registration":
      return "unsupported_provider";
    case "connection":
      return mapConnectionFailureKind(errorMessage);
    case "provenance":
      return "provenance_mismatch";
    case "malformed":
      return "malformed_identity";
    case "poll":
      return "poll_failed";
    default:
      return "internal_error";
  }
}

function mapConnectionFailureKind(errorMessage?: string): ChannelPollTransportFailureKind {
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
  failureKind: ChannelPollTransportFailureKind,
): ChannelPollRetryClassification {
  switch (failureKind) {
    case "receive_failed":
    case "poll_failed":
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
