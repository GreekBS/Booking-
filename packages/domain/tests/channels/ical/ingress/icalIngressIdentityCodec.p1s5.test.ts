import { describe, expect, it } from "vitest";
import {
  assignIcalIngressOccurrenceOrdinals,
  buildIcalIngressDedupKeyV1,
  buildIcalIngressDedupPreimageV1,
  buildIcalIngressMessageIdV1,
  ICAL_INGRESS_DEDUP_KEY_LENGTH,
  ICAL_INGRESS_DEDUP_TAG,
  ICAL_MESSAGE_ID_LENGTH,
  ICAL_MESSAGE_ID_TAG,
} from "../../../../src/channels/providers/ical/ingress/icalIngressIdentityCodec";
import { ICAL_MAP_LIMITS } from "../../../../src/channels/providers/ical/map/icalMapLimits";
import type { IcalMappedRecord } from "../../../../src/channels/providers/ical/map/icalEvidenceTypes";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function baseIdentity(overrides: Partial<Parameters<typeof buildIcalIngressDedupKeyV1>[0]> = {}) {
  return {
    connectionId: "conn-1",
    change: "added" as const,
    identityKey: "identity-a",
    contentFingerprintHex: HASH_A,
    occurrenceOrdinal: 0,
    ...overrides,
  };
}

function record(
  overrides: Partial<IcalMappedRecord> & Pick<IcalMappedRecord, "change">,
): IcalMappedRecord {
  if (overrides.change === "removed") {
    return {
      change: "removed",
      identityKey: overrides.identityKey ?? "identity-a",
      providerEventId: overrides.providerEventId ?? "uid@x",
      previousEntryContentHash: overrides.previousEntryContentHash ?? HASH_A,
      evidenceKind: "unknown",
      primaryCategory: "cancellation_unproven",
      reasonCodes: overrides.reasonCodes ?? ["removed_from_feed"],
    };
  }
  return {
    change: overrides.change,
    identityKey: overrides.identityKey ?? "identity-a",
    providerEventId: overrides.providerEventId ?? "uid@x",
    entryContentHash: overrides.entryContentHash ?? HASH_A,
    interval: overrides.interval ?? null,
    evidenceKind: overrides.evidenceKind ?? "unknown",
    primaryCategory: overrides.primaryCategory ?? "duplicate_uid",
    reasonCodes: overrides.reasonCodes ?? ["duplicate_uid"],
  };
}

describe("icalIngressIdentityCodec P1-S5", () => {
  it("uses canonical TLV tags and exact dedup key length (80)", () => {
    const identity = baseIdentity();
    const preimage = buildIcalIngressDedupPreimageV1(identity);
    expect(preimage.byteLength).toBeGreaterThan(ICAL_INGRESS_DEDUP_TAG.length);

    const key = buildIcalIngressDedupKeyV1(identity);
    expect(key.value).toMatch(/^ingress:ical:v1:[0-9a-f]{64}$/);
    expect(key.value.length).toBe(ICAL_INGRESS_DEDUP_KEY_LENGTH);
    expect(ICAL_INGRESS_DEDUP_KEY_LENGTH).toBe(80);
  });

  it("uses separate messageId domain tag and exact length (76)", () => {
    const digest = "c".repeat(64);
    const messageId = buildIcalIngressMessageIdV1(digest);
    expect(messageId).toMatch(/^ical-msg-v1-[0-9a-f]{64}$/);
    expect(messageId.length).toBe(ICAL_MESSAGE_ID_LENGTH);
    expect(ICAL_MESSAGE_ID_LENGTH).toBe(76);
    expect(ICAL_MESSAGE_ID_TAG).toBe("ical-message-id-v1");
  });

  it("encodes change enum exhaustively", () => {
    for (const change of ["added", "updated", "removed"] as const) {
      const fingerprint = change === "removed" ? HASH_B : HASH_A;
      const key = buildIcalIngressDedupKeyV1(baseIdentity({ change, contentFingerprintHex: fingerprint }));
      expect(key.value.length).toBe(80);
    }
    expect(() =>
      buildIcalIngressDedupKeyV1(
        baseIdentity({ change: "added" as "added" }) as never,
      ),
    ).not.toThrow();
  });

  it("rejects uppercase fingerprint hex", () => {
    expect(() =>
      buildIcalIngressDedupKeyV1(baseIdentity({ contentFingerprintHex: "A".repeat(64) })),
    ).toThrow(/lowercase hex/);
  });

  it("rejects invalid fingerprint length", () => {
    expect(() =>
      buildIcalIngressDedupKeyV1(baseIdentity({ contentFingerprintHex: "abc" })),
    ).toThrow(/64 lowercase hex/);
  });

  it("rejects empty connectionId and identityKey", () => {
    expect(() => buildIcalIngressDedupKeyV1(baseIdentity({ connectionId: "  " }))).toThrow(
      /connectionId/,
    );
    expect(() => buildIcalIngressDedupKeyV1(baseIdentity({ identityKey: "" }))).toThrow(
      /identityKey/,
    );
  });

  it("rejects identityKey beyond S4 limit", () => {
    const tooLong = "x".repeat(ICAL_MAP_LIMITS.maxIdentityBase64urlBytes + 1);
    expect(() => buildIcalIngressDedupKeyV1(baseIdentity({ identityKey: tooLong }))).toThrow(
      /maximum length/,
    );
  });

  it("rejects invalid occurrenceOrdinal", () => {
    expect(() => buildIcalIngressDedupKeyV1(baseIdentity({ occurrenceOrdinal: -1 }))).toThrow(
      /uint32/,
    );
    expect(() =>
      buildIcalIngressDedupKeyV1(baseIdentity({ occurrenceOrdinal: 0xffffffff + 1 })),
    ).toThrow(/uint32/);
  });

  it("assigns occurrence ordinals 0,1 for identical added twins left-to-right", () => {
    const records = [
      record({ change: "added", identityKey: "k", entryContentHash: HASH_A }),
      record({ change: "added", identityKey: "k", entryContentHash: HASH_A }),
    ];
    expect(assignIcalIngressOccurrenceOrdinals(records)).toEqual([0, 1]);
  });

  it("assigns occurrence ordinals 0,1,2 for three identical twins", () => {
    const records = [
      record({ change: "added", identityKey: "k", entryContentHash: HASH_A }),
      record({ change: "added", identityKey: "k", entryContentHash: HASH_A }),
      record({ change: "added", identityKey: "k", entryContentHash: HASH_A }),
    ];
    expect(assignIcalIngressOccurrenceOrdinals(records)).toEqual([0, 1, 2]);
  });

  it("assigns occurrence ordinals for identical removed twins", () => {
    const records = [
      record({ change: "removed", identityKey: "k", previousEntryContentHash: HASH_A }),
      record({ change: "removed", identityKey: "k", previousEntryContentHash: HASH_A }),
    ];
    expect(assignIcalIngressOccurrenceOrdinals(records)).toEqual([0, 1]);
  });

  it("produces deterministic ordinals on replay", () => {
    const records = [
      record({ change: "updated", identityKey: "k", entryContentHash: HASH_B }),
      record({ change: "added", identityKey: "k", entryContentHash: HASH_A }),
      record({ change: "added", identityKey: "k", entryContentHash: HASH_A }),
    ];
    const first = assignIcalIngressOccurrenceOrdinals(records);
    const second = assignIcalIngressOccurrenceOrdinals(records);
    expect(first).toEqual(second);
    expect(first).toEqual([0, 0, 1]);
  });

  it("differentiates same UID different RID via identityKey in preimage", () => {
    const keyA = buildIcalIngressDedupKeyV1(
      baseIdentity({ identityKey: "identity-rid-a", contentFingerprintHex: HASH_A }),
    );
    const keyB = buildIcalIngressDedupKeyV1(
      baseIdentity({ identityKey: "identity-rid-b", contentFingerprintHex: HASH_A }),
    );
    expect(keyA.value).not.toBe(keyB.value);
  });
});
