import { describe, expect, it } from "vitest";
import {
  UNKNOWN_CATEGORIES_V1,
  UNKNOWN_CLASSIFICATION_PAYLOAD_KEY,
  UNKNOWN_REASON_CODES,
  UNKNOWN_TAXONOMY_VERSION_1,
  CLASSIFICATION_REASON_ALIAS_KEY,
  LEGACY_MISSING_TAXONOMY_CLASSIFICATION,
  isUnknownCategoryV1,
} from "../../src/channels/types/UnknownTaxonomy";
import { validateUnknownClassificationV1 } from "../../src/channels/types/UnknownClassificationValidation";
import {
  isLegacyMissingUnknownClassification,
  readUnknownClassification,
} from "../../src/channels/types/readUnknownClassification";
import {
  buildReservationUnknownMessage,
  buildUnknownClassificationV1,
} from "../../src/channels/types/buildReservationUnknownMessage";

describe("Unknown taxonomy foundation (CM-4b S1)", () => {
  describe("taxonomy v1 categories", () => {
    it("accepts every approved taxonomy v1 category", () => {
      for (const category of UNKNOWN_CATEGORIES_V1) {
        const result = validateUnknownClassificationV1({
          taxonomyVersion: UNKNOWN_TAXONOMY_VERSION_1,
          category,
          reasonCode: "representative_reason",
          reclassifiable: false,
        });
        expect(result.isSuccess).toBe(true);
        expect(result.getValue().category).toBe(category);
        expect(isUnknownCategoryV1(category)).toBe(true);
      }
      expect(UNKNOWN_CATEGORIES_V1).toHaveLength(16);
    });

    it("rejects unknown category", () => {
      const result = validateUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "not_a_real_category",
        reasonCode: "representative_reason",
        reclassifiable: false,
      });
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/taxonomy v1 category/i);
    });
  });

  describe("taxonomyVersion", () => {
    it("accepts taxonomyVersion 1", () => {
      const result = validateUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "other_unclassified",
        reasonCode: "representative_reason",
        reclassifiable: true,
      });
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().taxonomyVersion).toBe(1);
    });

    it.each([0, -1, 1.5, Number.NaN, "1", null, undefined])(
      "rejects invalid or unsupported taxonomyVersion: %s",
      (taxonomyVersion) => {
        const result = validateUnknownClassificationV1({
          taxonomyVersion: taxonomyVersion as number,
          category: "other_unclassified",
          reasonCode: "representative_reason",
          reclassifiable: false,
        });
        expect(result.isFailure).toBe(true);
      },
    );

    it("rejects unsupported positive version for construction", () => {
      const result = validateUnknownClassificationV1({
        taxonomyVersion: 2,
        category: "other_unclassified",
        reasonCode: "representative_reason",
        reclassifiable: false,
      });
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/not supported for construction/i);
    });
  });

  describe("reasonCode", () => {
    it("rejects empty reasonCode", () => {
      const result = validateUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "other_unclassified",
        reasonCode: "   ",
        reclassifiable: false,
      });
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/reasonCode/i);
    });

    it.each(["CamelCase", "has space", "dot.separated", "UPPER_SNAKE", "1starts_digit", ""])(
      "rejects non-machine-readable reasonCode: %s",
      (reasonCode) => {
        const result = validateUnknownClassificationV1({
          taxonomyVersion: 1,
          category: "other_unclassified",
          reasonCode,
          reclassifiable: false,
        });
        expect(result.isFailure).toBe(true);
      },
    );

    it("accepts stable snake_case reasonCode", () => {
      const result = validateUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "malformed_identity",
        reasonCode: "missing_uid",
        reclassifiable: false,
      });
      expect(result.isSuccess).toBe(true);
    });
  });

  describe("reclassifiable and optional fields", () => {
    it("rejects missing reclassifiable", () => {
      const result = validateUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "other_unclassified",
        reasonCode: "representative_reason",
      } as never);
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toMatch(/reclassifiable is required/i);
    });

    it("rejects invalid optional-field types", () => {
      const badDetail = validateUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "other_unclassified",
        reasonCode: "representative_reason",
        reclassifiable: false,
        providerDetail: 42 as unknown as string,
      });
      expect(badDetail.isFailure).toBe(true);

      const badNotes = validateUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "other_unclassified",
        reasonCode: "representative_reason",
        reclassifiable: false,
        notes: { text: "x" } as unknown as string,
      });
      expect(badNotes.isFailure).toBe(true);
    });

    it("preserves valid providerDetail and notes", () => {
      const result = validateUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "provider_limitation",
        reasonCode: "feed_class_limitation",
        reclassifiable: false,
        providerDetail: "airbnb_ical_subset",
        notes: "ops: review mapping",
      });
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().providerDetail).toBe("airbnb_ical_subset");
      expect(result.getValue().notes).toBe("ops: review mapping");
    });
  });

  describe("shared factory", () => {
    it("always emits taxonomy v1", () => {
      const result = buildReservationUnknownMessage({
        messageId: "msg-1",
        connectionId: "conn-1",
        provider: "manual",
        classification: {
          taxonomyVersion: 1,
          category: "ambiguous_reservation",
          reasonCode: "unproven_occupancy",
          reclassifiable: false,
        },
        evidencePayload: {
          providerEventType: "reservation.reinstated",
          providerEventId: "evt-1",
        },
        externalReservationId: "ext-1",
      });
      expect(result.isSuccess).toBe(true);
      const message = result.getValue();
      expect(message.kind).toBe("reservation.unknown");
      const envelope = message.payload[UNKNOWN_CLASSIFICATION_PAYLOAD_KEY] as {
        taxonomyVersion: number;
      };
      expect(envelope.taxonomyVersion).toBe(UNKNOWN_TAXONOMY_VERSION_1);
      expect(message.payload[CLASSIFICATION_REASON_ALIAS_KEY]).toBe("unproven_occupancy");
    });

    it("cannot create reservation.unknown without classification", () => {
      const result = buildReservationUnknownMessage({
        messageId: "msg-1",
        connectionId: "conn-1",
        provider: "manual",
        classification: undefined as never,
      });
      expect(result.isFailure).toBe(true);
    });

    it("preserves existing provider evidence fields", () => {
      const result = buildReservationUnknownMessage({
        messageId: "msg-1",
        connectionId: "conn-1",
        provider: "manual",
        classification: {
          taxonomyVersion: 1,
          category: "cancellation_unproven",
          reasonCode: "cancel_without_reservation_proof",
          reclassifiable: false,
        },
        evidencePayload: {
          providerEventType: "vevent.cancelled",
          providerEventId: "uid-1",
          rawComponentSnippet: "BEGIN:VEVENT",
        },
      });
      expect(result.isSuccess).toBe(true);
      const payload = result.getValue().payload;
      expect(payload.providerEventType).toBe("vevent.cancelled");
      expect(payload.providerEventId).toBe("uid-1");
      expect(payload.rawComponentSnippet).toBe("BEGIN:VEVENT");
    });

    it("overwrites ad hoc classification in evidence with validated envelope", () => {
      const result = buildReservationUnknownMessage({
        messageId: "msg-1",
        connectionId: "conn-1",
        provider: "manual",
        classification: {
          taxonomyVersion: 1,
          category: "other_unclassified",
          reasonCode: "factory_authoritative",
          reclassifiable: false,
        },
        evidencePayload: {
          [UNKNOWN_CLASSIFICATION_PAYLOAD_KEY]: {
            taxonomyVersion: 1,
            category: "inventory_block",
            reasonCode: "should_be_replaced",
            reclassifiable: true,
          },
          [CLASSIFICATION_REASON_ALIAS_KEY]: "stale_alias",
        },
      });
      expect(result.isSuccess).toBe(true);
      const envelope = result.getValue().payload[UNKNOWN_CLASSIFICATION_PAYLOAD_KEY] as {
        reasonCode: string;
        category: string;
      };
      expect(envelope.reasonCode).toBe("factory_authoritative");
      expect(envelope.category).toBe("other_unclassified");
      expect(result.getValue().payload[CLASSIFICATION_REASON_ALIAS_KEY]).toBe(
        "factory_authoritative",
      );
    });

    it("taxonomy output contains no transport/credential fields by construction", () => {
      const result = buildUnknownClassificationV1({
        taxonomyVersion: 1,
        category: "parser_limitation",
        reasonCode: "partial_parse",
        reclassifiable: false,
        providerDetail: "component_truncated",
        notes: "safe ops hint",
      });
      expect(result.isSuccess).toBe(true);
      const envelope = result.getValue();
      expect(Object.keys(envelope).sort()).toEqual(
        ["category", "notes", "providerDetail", "reasonCode", "reclassifiable", "taxonomyVersion"].sort(),
      );
      expect(envelope).not.toHaveProperty("credential");
      expect(envelope).not.toHaveProperty("feedUrl");
      expect(envelope).not.toHaveProperty("authorization");
      expect(envelope).not.toHaveProperty("signingSecret");
    });
  });

  describe("legacy compatibility", () => {
    it("returns approved legacy classification when envelope is missing", () => {
      const payload = {
        providerEventType: "reservation.reinstated",
        providerEventId: "evt-legacy",
      };
      expect(isLegacyMissingUnknownClassification(payload)).toBe(true);
      const result = readUnknownClassification(payload);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(LEGACY_MISSING_TAXONOMY_CLASSIFICATION);
      expect(result.getValue().reasonCode).toBe(UNKNOWN_REASON_CODES.LEGACY_MISSING_TAXONOMY);
      expect(result.getValue().category).toBe("other_unclassified");
    });

    it("does not mutate historical payload during legacy interpretation", () => {
      const payload = {
        providerEventType: "reservation.reinstated",
        providerEventId: "evt-legacy",
      };
      const before = JSON.stringify(payload);
      readUnknownClassification(payload);
      expect(JSON.stringify(payload)).toBe(before);
      expect(payload).not.toHaveProperty(UNKNOWN_CLASSIFICATION_PAYLOAD_KEY);
    });
  });

  describe("production-safe exports", () => {
    it("exposes taxonomy APIs from channels types barrel without harness imports", async () => {
      const barrel = await import("../../src/channels/types/index");
      expect(typeof barrel.buildReservationUnknownMessage).toBe("function");
      expect(typeof barrel.validateUnknownClassificationV1).toBe("function");
      expect(typeof barrel.readUnknownClassification).toBe("function");
      expect(barrel.UNKNOWN_TAXONOMY_VERSION_1).toBe(1);
      expect(barrel.UNKNOWN_CATEGORIES_V1).toContain("ambiguous_reservation");
      expect(barrel).not.toHaveProperty("definePollingProviderContract");
      expect(barrel).not.toHaveProperty("createChannelIngressTestStack");
      expect(barrel).not.toHaveProperty("TestChannelPollingProvider");
    });
  });
});
