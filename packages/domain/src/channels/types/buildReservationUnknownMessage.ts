import { ValidationError } from "../../shared/errors/DomainError";
import { Result } from "../../shared/kernel/Result";
import type { ChannelSource } from "./ChannelSource";
import type { ChannelImportPayload } from "./ChannelTypes";
import type { ChannelProviderMessage } from "./ChannelProviderMessage";
import {
  CLASSIFICATION_REASON_ALIAS_KEY,
  UNKNOWN_CLASSIFICATION_PAYLOAD_KEY,
  UNKNOWN_TAXONOMY_VERSION_1,
  type UnknownClassificationV1,
} from "./UnknownTaxonomy";
import {
  validateUnknownClassificationV1,
  type UnknownClassificationInput,
} from "./UnknownClassificationValidation";
import { deriveClassificationReasonAlias } from "./readUnknownClassification";

/**
 * Fields that must never appear on the taxonomy envelope (evidence metadata only).
 * Documented non-secret boundary for `providerDetail` / `notes`.
 */
const FORBIDDEN_ENVELOPE_FIELD_NAMES = [
  "credential",
  "credentials",
  "secret",
  "secrets",
  "token",
  "authorization",
  "password",
  "feedUrl",
  "feed_url",
  "rawBody",
  "rawBodyBytes",
  "signingSecret",
  "webhookSecret",
] as const;

export type BuildReservationUnknownMessageInput = {
  messageId: string;
  connectionId: string;
  provider: ChannelSource;
  receivedAt?: Date;
  /** Required taxonomy envelope (validated as taxonomy v1). */
  classification: UnknownClassificationInput;
  /**
   * Existing provider evidence to preserve (e.g. providerEventType, providerEventId).
   * Must not be used as a second classification source — envelope is overwritten by `classification`.
   */
  evidencePayload?: ChannelImportPayload | Record<string, unknown>;
  externalListingId?: string;
  externalUnitId?: string;
  externalReservationId?: string;
  externalUpdatedAt?: string;
};

/**
 * Shared construction path for `reservation.unknown` messages (CM-4b S1).
 *
 * Always emits taxonomy v1. Classification cannot be omitted.
 * Does not call Receive, write Inbox, or touch Commerce/Booking.
 */
export function buildReservationUnknownMessage(
  input: BuildReservationUnknownMessageInput,
): Result<ChannelProviderMessage, ValidationError> {
  if (typeof input.messageId !== "string" || input.messageId.trim().length === 0) {
    return Result.fail(new ValidationError("messageId is required"));
  }
  if (typeof input.connectionId !== "string" || input.connectionId.trim().length === 0) {
    return Result.fail(new ValidationError("connectionId is required"));
  }

  const classificationResult = validateUnknownClassificationV1(input.classification);
  if (classificationResult.isFailure) {
    return Result.fail(classificationResult.getError());
  }
  const classification = classificationResult.getValue();

  const envelopeGuard = assertEnvelopeHasNoForbiddenFields(classification);
  if (envelopeGuard.isFailure) {
    return Result.fail(envelopeGuard.getError());
  }

  const payload = buildUnknownPayload(input.evidencePayload, classification);

  const message: ChannelProviderMessage = {
    messageId: input.messageId.trim(),
    kind: "reservation.unknown",
    receivedAt: input.receivedAt ?? new Date(),
    connectionId: input.connectionId.trim(),
    provider: input.provider,
    payload,
  };

  if (input.externalListingId !== undefined) {
    message.externalListingId = input.externalListingId;
  }
  if (input.externalUnitId !== undefined) {
    message.externalUnitId = input.externalUnitId;
  }
  if (input.externalReservationId !== undefined) {
    message.externalReservationId = input.externalReservationId;
  }
  if (input.externalUpdatedAt !== undefined) {
    message.externalUpdatedAt = input.externalUpdatedAt;
  }

  return Result.ok(message);
}

/**
 * Construct a validated taxonomy v1 envelope (shared helper for adapters / S8).
 */
export function buildUnknownClassificationV1(
  input: UnknownClassificationInput,
): Result<UnknownClassificationV1, ValidationError> {
  const forced: UnknownClassificationInput = {
    ...input,
    taxonomyVersion: UNKNOWN_TAXONOMY_VERSION_1,
  };
  return validateUnknownClassificationV1(forced);
}

function buildUnknownPayload(
  evidence: ChannelImportPayload | Record<string, unknown> | undefined,
  classification: UnknownClassificationV1,
): ChannelImportPayload {
  const payload: ChannelImportPayload = {};

  if (evidence) {
    for (const [key, value] of Object.entries(evidence)) {
      if (key === UNKNOWN_CLASSIFICATION_PAYLOAD_KEY || key === CLASSIFICATION_REASON_ALIAS_KEY) {
        continue;
      }
      payload[key] = value;
    }
  }

  payload[UNKNOWN_CLASSIFICATION_PAYLOAD_KEY] = {
    taxonomyVersion: classification.taxonomyVersion,
    category: classification.category,
    reasonCode: classification.reasonCode,
    reclassifiable: classification.reclassifiable,
    ...(classification.providerDetail !== undefined
      ? { providerDetail: classification.providerDetail }
      : {}),
    ...(classification.notes !== undefined ? { notes: classification.notes } : {}),
  };

  // Derived alias only — mirrors reasonCode; not independently writable.
  payload[CLASSIFICATION_REASON_ALIAS_KEY] = deriveClassificationReasonAlias(
    classification.reasonCode,
  );

  return payload;
}

function assertEnvelopeHasNoForbiddenFields(
  classification: UnknownClassificationV1,
): Result<void, ValidationError> {
  const keys = Object.keys(classification);
  for (const forbidden of FORBIDDEN_ENVELOPE_FIELD_NAMES) {
    if (keys.includes(forbidden)) {
      return Result.fail(
        new ValidationError(
          `unknownClassification must not contain transport/credential field: ${forbidden}`,
        ),
      );
    }
  }
  return Result.ok(undefined);
}
