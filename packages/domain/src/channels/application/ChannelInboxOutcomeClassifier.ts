import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import type { ChannelInboxProcessingOutcome } from "../domain/ChannelInboxProcessingOutcome";
import type { ChannelInboxProcessingStatus } from "../domain/ChannelInboxProcessingStatus";

export const AVAILABILITY_CONFLICT_MESSAGE = "Dates no longer available";
export const LINK_DUPLICATE_MESSAGE = "External reservation link already exists for this connection";
export const STALE_MAPPING_MESSAGE =
  "Mapping version changed since dry-run; re-run CM-3a import dry-run";

export class TransientInfrastructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientInfrastructureError";
  }
}

export interface ClassifiedInboxOutcome {
  status: ChannelInboxProcessingStatus;
  outcome: ChannelInboxProcessingOutcome;
  outcomeDetail?: string;
  shouldRetryJob: boolean;
}

export interface ClassifyInboxOutcomeInput {
  error?: Error;
  duplicate?: boolean;
  success?: boolean;
  unsupported?: boolean;
  inboxAttemptCount: number;
}

const STALE_MAPPING_MAX_ATTEMPTS = 2;

export function classifyInboxOutcome(input: ClassifyInboxOutcomeInput): ClassifiedInboxOutcome {
  if (input.success) {
    return {
      status: "completed",
      outcome: "SUCCESS",
      shouldRetryJob: false,
    };
  }

  if (input.duplicate) {
    return {
      status: "duplicate",
      outcome: "DUPLICATE",
      shouldRetryJob: false,
    };
  }

  if (input.unsupported) {
    return {
      status: "skipped",
      outcome: "UNSUPPORTED",
      shouldRetryJob: false,
    };
  }

  const error = input.error ?? new Error("Unknown processing error");

  if (error instanceof ConflictError) {
    if (error.message === AVAILABILITY_CONFLICT_MESSAGE) {
      return {
        status: "dead_letter",
        outcome: "AVAILABILITY_CONFLICT",
        outcomeDetail: error.message,
        shouldRetryJob: false,
      };
    }
    if (error.message === STALE_MAPPING_MESSAGE) {
      if (input.inboxAttemptCount < STALE_MAPPING_MAX_ATTEMPTS) {
        return {
          status: "failed",
          outcome: "STALE_MAPPING",
          outcomeDetail: error.message,
          shouldRetryJob: true,
        };
      }
      return {
        status: "dead_letter",
        outcome: "STALE_MAPPING",
        outcomeDetail: error.message,
        shouldRetryJob: false,
      };
    }
    if (error.message === LINK_DUPLICATE_MESSAGE) {
      return {
        status: "duplicate",
        outcome: "DUPLICATE",
        outcomeDetail: error.message,
        shouldRetryJob: false,
      };
    }
  }

  if (error instanceof ValidationError) {
    if (isAvailabilityConflictMessage(error.message)) {
      return {
        status: "dead_letter",
        outcome: "AVAILABILITY_CONFLICT",
        outcomeDetail: error.message,
        shouldRetryJob: false,
      };
    }
    // Out-of-order modify/cancel before create: ACK may already have succeeded.
    // Retry until the create link exists instead of permanently dead-lettering.
    if (isAwaitingExternalCreateMessage(error.message)) {
      return {
        status: "failed",
        outcome: "TRANSIENT_ERROR",
        outcomeDetail: error.message,
        shouldRetryJob: true,
      };
    }
    return {
      status: "dead_letter",
      outcome: "VALIDATION_ERROR",
      outcomeDetail: error.message,
      shouldRetryJob: false,
    };
  }

  if (error instanceof TransientInfrastructureError || isTransientMessage(error.message)) {
    return {
      status: "failed",
      outcome: "TRANSIENT_ERROR",
      outcomeDetail: error.message,
      shouldRetryJob: true,
    };
  }

  return {
    status: "dead_letter",
    outcome: "INTERNAL_ERROR",
    outcomeDetail: error.message,
    shouldRetryJob: false,
  };
}

function isTransientMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("econnreset") ||
    normalized.includes("econnrefused") ||
    normalized.includes("connection terminated") ||
    normalized.includes("too many connections")
  );
}

function isAvailabilityConflictMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("dates no longer available") ||
    normalized.includes("dates not available") ||
    normalized.includes("dates overlap with")
  );
}

function isAwaitingExternalCreateMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("cannot invent a booking") ||
    normalized.includes("external reservation link not found")
  );
}
