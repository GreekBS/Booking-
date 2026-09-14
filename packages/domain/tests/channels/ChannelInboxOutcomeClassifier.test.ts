import { describe, it, expect } from "vitest";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import {
  AVAILABILITY_CONFLICT_MESSAGE,
  STALE_MAPPING_MESSAGE,
  TransientInfrastructureError,
  classifyInboxOutcome,
} from "../../src/channels/application/ChannelInboxOutcomeClassifier";

describe("classifyInboxOutcome", () => {
  it("classifies success", () => {
    const result = classifyInboxOutcome({ success: true, inboxAttemptCount: 1 });
    expect(result).toMatchObject({ status: "completed", outcome: "SUCCESS", shouldRetryJob: false });
  });

  it("classifies duplicate", () => {
    const result = classifyInboxOutcome({ duplicate: true, inboxAttemptCount: 1 });
    expect(result).toMatchObject({ status: "duplicate", outcome: "DUPLICATE", shouldRetryJob: false });
  });

  it("classifies availability conflict as terminal", () => {
    const result = classifyInboxOutcome({
      error: new ConflictError(AVAILABILITY_CONFLICT_MESSAGE),
      inboxAttemptCount: 1,
    });
    expect(result).toMatchObject({
      status: "dead_letter",
      outcome: "AVAILABILITY_CONFLICT",
      shouldRetryJob: false,
    });
  });

  it("retries stale mapping before dead-lettering", () => {
    const retry = classifyInboxOutcome({
      error: new ConflictError(STALE_MAPPING_MESSAGE),
      inboxAttemptCount: 1,
    });
    expect(retry.shouldRetryJob).toBe(true);

    const terminal = classifyInboxOutcome({
      error: new ConflictError(STALE_MAPPING_MESSAGE),
      inboxAttemptCount: 2,
    });
    expect(terminal).toMatchObject({ status: "dead_letter", outcome: "STALE_MAPPING" });
  });

  it("classifies prepare-time overlap validation as availability conflict", () => {
    const result = classifyInboxOutcome({
      error: new ValidationError("Dates overlap with booking block"),
      inboxAttemptCount: 1,
    });
    expect(result).toMatchObject({
      status: "dead_letter",
      outcome: "AVAILABILITY_CONFLICT",
      shouldRetryJob: false,
    });
  });

  it("classifies validation errors as terminal", () => {
    const result = classifyInboxOutcome({
      error: new ValidationError("bad mapping"),
      inboxAttemptCount: 1,
    });
    expect(result).toMatchObject({
      status: "dead_letter",
      outcome: "VALIDATION_ERROR",
      shouldRetryJob: false,
    });
  });

  it("classifies transient infrastructure errors as retryable", () => {
    const result = classifyInboxOutcome({
      error: new TransientInfrastructureError("connection timeout"),
      inboxAttemptCount: 1,
    });
    expect(result).toMatchObject({
      status: "failed",
      outcome: "TRANSIENT_ERROR",
      shouldRetryJob: true,
    });
  });
});
