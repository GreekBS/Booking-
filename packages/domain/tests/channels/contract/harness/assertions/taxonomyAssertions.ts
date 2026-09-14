import { expect } from "vitest";
import type { ChannelProviderMessage } from "../../../../../src/channels/types/ChannelProviderMessage";
import {
  CLASSIFICATION_REASON_ALIAS_KEY,
  UNKNOWN_CLASSIFICATION_PAYLOAD_KEY,
  UNKNOWN_TAXONOMY_VERSION_1,
  type UnknownClassification,
  type UnknownClassificationV1,
} from "../../../../../src/channels/types/UnknownTaxonomy";
import { validateUnknownClassificationV1 } from "../../../../../src/channels/types/UnknownClassificationValidation";
import {
  isLegacyMissingUnknownClassification,
  readUnknownClassification,
} from "../../../../../src/channels/types/readUnknownClassification";
import type { ProviderContractStack } from "../../../../../src/channels/contract/ProviderContractFixtureTypes";

export type UnknownTaxonomyAssertionOptions = {
  /**
   * When true, a missing envelope is a conformance failure.
   * When false, missing envelopes are accepted via legacy interpretation.
   * Default: true when the fixture unknown message already carries an envelope.
   */
  requireEnvelope?: boolean;
  /** Optional expected taxonomy fields (compared after readUnknownClassification). */
  expected?: Partial<
    Pick<
      UnknownClassificationV1,
      "taxonomyVersion" | "category" | "reasonCode" | "reclassifiable" | "providerDetail" | "notes"
    >
  >;
};

/**
 * Asserts a `reservation.unknown` ChannelProviderMessage carries valid taxonomy
 * via S1 APIs (not manual envelope inspection).
 */
export function assertUnknownMessageTaxonomy(
  message: ChannelProviderMessage,
  options: UnknownTaxonomyAssertionOptions = {},
): UnknownClassification {
  expect(message.kind).toBe("reservation.unknown");
  return assertPayloadTaxonomy(message.payload, options);
}

/**
 * Asserts Inbox `reservation.unknown` evidence has readable taxonomy via S1 APIs.
 */
export function assertInboxUnknownTaxonomy(
  stack: ProviderContractStack,
  options: UnknownTaxonomyAssertionOptions = {},
): UnknownClassification {
  const items = listInboxItems(stack);
  const unknownItem = items.find((item) => readMessageKind(item) === "reservation.unknown");
  expect(unknownItem).toBeDefined();
  const rawPayload = readRawPayload(unknownItem);
  const payload = (rawPayload.payload ?? {}) as Record<string, unknown>;
  return assertPayloadTaxonomy(payload, options);
}

/**
 * Derives requireEnvelope from a fixture's expected unknown message:
 * new factory-built messages require a real envelope; legacy omitters do not.
 */
export function deriveRequireUnknownTaxonomyEnvelope(
  unknownMessage: ChannelProviderMessage,
): boolean {
  return !isLegacyMissingUnknownClassification(unknownMessage.payload);
}

function assertPayloadTaxonomy(
  payload: Record<string, unknown>,
  options: UnknownTaxonomyAssertionOptions,
): UnknownClassification {
  const requireEnvelope = options.requireEnvelope ?? false;
  const missing = isLegacyMissingUnknownClassification(payload);

  if (requireEnvelope && missing) {
    throw new Error(
      "Provider contract conformance failure: reservation.unknown is missing required unknownClassification envelope (new fixtures must use buildReservationUnknownMessage)",
    );
  }

  if (!missing) {
    const rawEnvelope = payload[UNKNOWN_CLASSIFICATION_PAYLOAD_KEY];
    const construction = validateUnknownClassificationV1(rawEnvelope);
    if (construction.isFailure) {
      throw new Error(
        `Provider contract conformance failure: unknownClassification is malformed: ${construction.getError().message}`,
      );
    }
    assertClassificationReasonDerived(payload, construction.getValue().reasonCode);
  }

  const readResult = readUnknownClassification(payload);
  if (readResult.isFailure) {
    throw new Error(
      `Provider contract conformance failure: readUnknownClassification failed: ${readResult.getError().message}`,
    );
  }

  const classification = readResult.getValue();

  if (options.expected) {
    if (options.expected.taxonomyVersion !== undefined) {
      expect(classification.taxonomyVersion).toBe(options.expected.taxonomyVersion);
    }
    if (options.expected.category !== undefined) {
      expect(classification.category).toBe(options.expected.category);
    }
    if (options.expected.reasonCode !== undefined) {
      expect(classification.reasonCode).toBe(options.expected.reasonCode);
    }
    if (options.expected.reclassifiable !== undefined) {
      expect(classification.reclassifiable).toBe(options.expected.reclassifiable);
    }
    if (options.expected.providerDetail !== undefined) {
      expect(classification.providerDetail).toBe(options.expected.providerDetail);
    }
    if (options.expected.notes !== undefined) {
      expect(classification.notes).toBe(options.expected.notes);
    }
  }

  if (!missing) {
    expect(classification.taxonomyVersion).toBe(UNKNOWN_TAXONOMY_VERSION_1);
    expect(typeof classification.category).toBe("string");
    expect(classification.category.length).toBeGreaterThan(0);
    expect(typeof classification.reasonCode).toBe("string");
    expect(classification.reasonCode.length).toBeGreaterThan(0);
    expect(typeof classification.reclassifiable).toBe("boolean");
  }

  return classification;
}

/** Alias must mirror reasonCode when present; never a second source of truth. */
export function assertClassificationReasonDerived(
  payload: Record<string, unknown>,
  reasonCode: string,
): void {
  if (!(CLASSIFICATION_REASON_ALIAS_KEY in payload)) {
    return;
  }
  expect(payload[CLASSIFICATION_REASON_ALIAS_KEY]).toBe(reasonCode);
}

function listInboxItems(stack: ProviderContractStack): unknown[] {
  const repo = stack.inboxRepository as { listAllForTest?: () => unknown[] };
  if (repo.listAllForTest) {
    return repo.listAllForTest();
  }
  if (stack.inboxRepository.findAll) {
    return stack.inboxRepository.findAll();
  }
  return [];
}

function readMessageKind(item: unknown): string | undefined {
  if (item && typeof item === "object" && "messageKind" in item) {
    return String((item as { messageKind: string }).messageKind);
  }
  return undefined;
}

function readRawPayload(item: unknown): Record<string, unknown> {
  if (item && typeof item === "object" && "rawPayload" in item) {
    return (item as { rawPayload: Record<string, unknown> }).rawPayload;
  }
  throw new Error("Inbox item rawPayload not found");
}
