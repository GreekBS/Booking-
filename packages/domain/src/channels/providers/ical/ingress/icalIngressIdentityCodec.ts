import { ValidationError } from "../../../../shared/errors/DomainError";
import { sha256Bytes, sha256HexBytes } from "../../../utils/sha256Hex";
import { ChannelInboxDeduplicationKey } from "../../../domain/value-objects/ChannelInboxDeduplicationKey";
import { BytesBuilder } from "../map/icalCanonicalEncoding";
import { ICAL_MAP_LIMITS } from "../map/icalMapLimits";
import type { IcalMappedRecord } from "../map/icalEvidenceTypes";

export const ICAL_INGRESS_DEDUP_TAG = "ical-ingress-dedup-v1";
export const ICAL_MESSAGE_ID_TAG = "ical-message-id-v1";
export const ICAL_INGRESS_DEDUP_KEY_PREFIX = "ingress:ical:v1:";
export const ICAL_MESSAGE_ID_PREFIX = "ical-msg-v1-";

export const ICAL_INGRESS_DEDUP_KEY_LENGTH = ICAL_INGRESS_DEDUP_KEY_PREFIX.length + 64;
export const ICAL_MESSAGE_ID_LENGTH = ICAL_MESSAGE_ID_PREFIX.length + 64;

const CHANGE_KIND_CODE = {
  added: 0,
  updated: 1,
  removed: 2,
} as const;

export interface IcalIngressSemanticIdentity {
  readonly connectionId: string;
  readonly change: "added" | "updated" | "removed";
  readonly identityKey: string;
  readonly contentFingerprintHex: string;
  readonly occurrenceOrdinal: number;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function validateConnectionId(connectionId: string): string {
  const trimmed = connectionId.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("connectionId is required");
  }
  return trimmed;
}

function validateIdentityKey(identityKey: string): string {
  const trimmed = identityKey.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("identityKey is required");
  }
  if (trimmed.length > ICAL_MAP_LIMITS.maxIdentityBase64urlBytes) {
    throw new ValidationError("identityKey exceeds maximum length");
  }
  return trimmed;
}

function validateContentFingerprintHex(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new ValidationError("content fingerprint must be 64 lowercase hex characters");
  }
  return value;
}

function validateOccurrenceOrdinal(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new ValidationError("occurrenceOrdinal must be a uint32");
  }
  return value;
}

export function buildIcalIngressDedupPreimageV1(
  identity: IcalIngressSemanticIdentity,
): Uint8Array {
  const connectionId = validateConnectionId(identity.connectionId);
  const identityKey = validateIdentityKey(identity.identityKey);
  const fingerprintHex = validateContentFingerprintHex(identity.contentFingerprintHex);
  const occurrenceOrdinal = validateOccurrenceOrdinal(identity.occurrenceOrdinal);
  const changeCode = CHANGE_KIND_CODE[identity.change];
  if (changeCode === undefined) {
    throw new ValidationError("unsupported ingress change kind");
  }

  const builder = new BytesBuilder();
  builder.writeUtf8Tagged(ICAL_INGRESS_DEDUP_TAG);
  builder.writeU8(changeCode);
  builder.writeLengthPrefixedUtf8(connectionId);
  builder.writeLengthPrefixedUtf8(identityKey);
  builder.writeBytes(hexToBytes(fingerprintHex));
  builder.writeU32(occurrenceOrdinal);
  return builder.toUint8Array();
}

export function buildIcalIngressDedupDigestHex(
  identity: IcalIngressSemanticIdentity,
): string {
  return sha256HexBytes(buildIcalIngressDedupPreimageV1(identity));
}

export function buildIcalIngressDedupKeyV1(
  identity: IcalIngressSemanticIdentity,
): ChannelInboxDeduplicationKey {
  const digestHex = buildIcalIngressDedupDigestHex(identity);
  return ChannelInboxDeduplicationKey.forIcalIngressDigestV1(digestHex);
}

export function buildIcalIngressMessageIdV1(dedupDigestHex: string): string {
  validateContentFingerprintHex(dedupDigestHex);
  const builder = new BytesBuilder();
  builder.writeUtf8Tagged(ICAL_MESSAGE_ID_TAG);
  builder.writeBytes(hexToBytes(dedupDigestHex));
  const messageId = `${ICAL_MESSAGE_ID_PREFIX}${sha256HexBytes(builder.toUint8Array())}`;
  if (messageId.length !== ICAL_MESSAGE_ID_LENGTH) {
    throw new ValidationError("ical ingress messageId length invariant violated");
  }
  return messageId;
}

export function assignIcalIngressOccurrenceOrdinals(
  records: readonly IcalMappedRecord[],
): readonly number[] {
  const counters = new Map<string, number>();
  const ordinals: number[] = [];
  for (const record of records) {
    const fingerprint =
      record.change === "removed" ? record.previousEntryContentHash : record.entryContentHash;
    const tupleKey = `${record.identityKey}\u0000${record.change}\u0000${fingerprint}`;
    const ordinal = counters.get(tupleKey) ?? 0;
    counters.set(tupleKey, ordinal + 1);
    ordinals.push(ordinal);
  }
  return ordinals;
}

export function contentFingerprintForRecord(record: IcalMappedRecord): string {
  return record.change === "removed" ? record.previousEntryContentHash : record.entryContentHash;
}

export { sha256Bytes };
