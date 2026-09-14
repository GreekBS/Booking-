import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_REASON_ALIAS_KEY,
  LEGACY_MISSING_TAXONOMY_CLASSIFICATION,
  UNKNOWN_CLASSIFICATION_PAYLOAD_KEY,
  UNKNOWN_REASON_CODES,
} from "../../../src/channels/types/UnknownTaxonomy";
import { validateUnknownClassificationV1 } from "../../../src/channels/types/UnknownClassificationValidation";
import {
  isLegacyMissingUnknownClassification,
  readUnknownClassification,
} from "../../../src/channels/types/readUnknownClassification";
import { buildReservationUnknownMessage } from "../../../src/channels/types/buildReservationUnknownMessage";
import {
  assertClassificationReasonDerived,
  assertUnknownMessageTaxonomy,
  deriveRequireUnknownTaxonomyEnvelope,
} from "./harness/assertions/taxonomyAssertions";
import {
  buildLegacyUnknownReservationMessageWithoutTaxonomy,
  buildReferenceUnknownReservationMessage,
  REFERENCE_UNKNOWN_CLASSIFICATION,
} from "./fixtures/referenceProviderContractFixture";

describe("taxonomy-aware harness assertions (CM-4b S0b)", () => {
  it("accepts factory-generated reference unknown with valid taxonomy envelope", () => {
    const message = buildReferenceUnknownReservationMessage();
    expect(deriveRequireUnknownTaxonomyEnvelope(message)).toBe(true);
    const classification = assertUnknownMessageTaxonomy(message, {
      requireEnvelope: true,
      expected: REFERENCE_UNKNOWN_CLASSIFICATION,
    });
    expect(classification.taxonomyVersion).toBe(1);
    expect(classification.category).toBe("ambiguous_reservation");
    expect(classification.reasonCode).toBe("unsupported_provider_event");
    expect(message.payload[CLASSIFICATION_REASON_ALIAS_KEY]).toBe(
      REFERENCE_UNKNOWN_CLASSIFICATION.reasonCode,
    );
  });

  it("derives classificationReason from reasonCode on factory output", () => {
    const message = buildReferenceUnknownReservationMessage();
    assertClassificationReasonDerived(
      message.payload,
      REFERENCE_UNKNOWN_CLASSIFICATION.reasonCode,
    );
    expect(message.payload[CLASSIFICATION_REASON_ALIAS_KEY]).toBe(
      message.payload[UNKNOWN_CLASSIFICATION_PAYLOAD_KEY]
        ? (message.payload[UNKNOWN_CLASSIFICATION_PAYLOAD_KEY] as { reasonCode: string }).reasonCode
        : undefined,
    );
  });

  it("preserves legacy fixture compatibility via readUnknownClassification", () => {
    const legacy = buildLegacyUnknownReservationMessageWithoutTaxonomy();
    expect(isLegacyMissingUnknownClassification(legacy.payload)).toBe(true);
    expect(deriveRequireUnknownTaxonomyEnvelope(legacy)).toBe(false);

    const readResult = readUnknownClassification(legacy.payload);
    expect(readResult.isSuccess).toBe(true);
    expect(readResult.getValue()).toEqual(LEGACY_MISSING_TAXONOMY_CLASSIFICATION);
    expect(readResult.getValue().reasonCode).toBe(UNKNOWN_REASON_CODES.LEGACY_MISSING_TAXONOMY);

    const classification = assertUnknownMessageTaxonomy(legacy, { requireEnvelope: false });
    expect(classification).toEqual(LEGACY_MISSING_TAXONOMY_CLASSIFICATION);
  });

  it("rejects legacy unknown when envelope is required for new fixtures", () => {
    const legacy = buildLegacyUnknownReservationMessageWithoutTaxonomy();
    expect(() =>
      assertUnknownMessageTaxonomy(legacy, { requireEnvelope: true }),
    ).toThrow(/missing required unknownClassification envelope/i);
  });

  it("rejects invalid taxonomy construction", () => {
    const result = validateUnknownClassificationV1({
      taxonomyVersion: 1,
      category: "not_a_real_category",
      reasonCode: "bad",
      reclassifiable: false,
    });
    expect(result.isFailure).toBe(true);
  });

  it("detects malformed envelopes on unknown messages", () => {
    const message = buildReferenceUnknownReservationMessage();
    const broken = {
      ...message,
      payload: {
        ...message.payload,
        [UNKNOWN_CLASSIFICATION_PAYLOAD_KEY]: {
          taxonomyVersion: 1,
          category: "ambiguous_reservation",
          reasonCode: "unsupported_provider_event",
          // reclassifiable omitted
        },
      },
    };
    expect(() =>
      assertUnknownMessageTaxonomy(broken, { requireEnvelope: true }),
    ).toThrow(/malformed|reclassifiable/i);
  });

  it("detects classificationReason diverging from reasonCode", () => {
    const message = buildReferenceUnknownReservationMessage();
    const diverged = {
      ...message,
      payload: {
        ...message.payload,
        [CLASSIFICATION_REASON_ALIAS_KEY]: "not_the_reason_code",
      },
    };
    expect(() =>
      assertUnknownMessageTaxonomy(diverged, { requireEnvelope: true }),
    ).toThrow();
  });

  it("buildReservationUnknownMessage remains the construction path for new unknowns", () => {
    const result = buildReservationUnknownMessage({
      messageId: "s0b-factory-1",
      connectionId: "550e8400-e29b-41d4-a716-446655440201",
      provider: "manual",
      classification: {
        taxonomyVersion: 1,
        category: "other_unclassified",
        reasonCode: "harness_smoke",
        reclassifiable: false,
      },
      evidencePayload: { providerEventId: "evt-smoke" },
    });
    expect(result.isSuccess).toBe(true);
    assertUnknownMessageTaxonomy(result.getValue(), {
      requireEnvelope: true,
      expected: {
        category: "other_unclassified",
        reasonCode: "harness_smoke",
        reclassifiable: false,
      },
    });
  });
});
