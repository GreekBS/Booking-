import { encodeUtf8, sha256Bytes, utf8ByteLength } from "../../../utils/sha256Hex";
import type { NormalizedIcalDateTime } from "../parse/icalParseTypes";
import {
  BytesBuilder,
  BytesReader,
  decodeBase64Url,
  encodeBase64Url,
  hexFromBytes,
} from "./icalCanonicalEncoding";
import { ICAL_MAP_LIMITS } from "./icalMapLimits";
import { IcalMapError } from "./icalMapErrors";
import {
  ICAL_IDENTITY_KIND_CODE,
  type IcalDecodedIdentity,
  type IcalEqualityFlags,
  type IcalIdentityKind,
  type IcalSnapshotInterval,
  type IcalStructuralFlags,
} from "./icalMapTypes";

const IDENTITY_TAG = "ical-id-v1";
const TEMPORAL_TAG = "ical-tmp-v1";
const ANON_TAG = "ical-anon-id-v1";

export interface IdentityBuildInput {
  uid: string | null;
  recurrenceId: NormalizedIcalDateTime | null;
  interval: IcalSnapshotInterval | null;
  flags: IcalStructuralFlags;
  equalityFlags: IcalEqualityFlags;
}

export interface IdentityBuildResult {
  identityKey: string;
  identityKind: IcalIdentityKind;
  providerEventId: string | null;
  equalityFlags: IcalEqualityFlags;
  binary: Uint8Array;
}

export function encodeTemporalV1(value: NormalizedIcalDateTime): Uint8Array {
  const builder = new BytesBuilder();
  builder.writeUtf8Tagged(TEMPORAL_TAG);
  const kindCode =
    value.kind === "date"
      ? 1
      : value.kind === "dateTimeUtc"
        ? 2
        : value.kind === "dateTimeFloating"
          ? 3
          : 4;
  builder.writeU8(kindCode);
  builder.writeU32(value.year);
  builder.writeU8(value.month);
  builder.writeU8(value.day);
  if (value.kind !== "date") {
    builder.writeU8(value.hour ?? 0);
    builder.writeU8(value.minute ?? 0);
    builder.writeU8(value.second ?? 0);
  }
  if (value.kind === "dateTimeWithTzId") {
    builder.writeLengthPrefixedUtf8(value.tzId ?? "");
  }
  builder.writeLengthPrefixedUtf8(value.value);
  return builder.toUint8Array();
}

function readTemporalFrom(reader: BytesReader): NormalizedIcalDateTime {
  reader.expectExactTag(TEMPORAL_TAG);
  const kindCode = reader.readU8();
  const year = reader.readU32();
  const month = reader.readU8();
  const day = reader.readU8();
  let hour: number | undefined;
  let minute: number | undefined;
  let second: number | undefined;
  let tzId: string | undefined;
  if (kindCode !== 1) {
    hour = reader.readU8();
    minute = reader.readU8();
    second = reader.readU8();
  }
  if (kindCode === 4) {
    tzId = reader.readLengthPrefixedUtf8();
  }
  const raw = reader.readLengthPrefixedUtf8();
  const kind =
    kindCode === 1
      ? "date"
      : kindCode === 2
        ? "dateTimeUtc"
        : kindCode === 3
          ? "dateTimeFloating"
          : kindCode === 4
            ? "dateTimeWithTzId"
            : null;
  if (kind === null) {
    throw new RangeError("bad temporal kind");
  }
  return {
    kind,
    year,
    month,
    day,
    ...(hour !== undefined ? { hour, minute, second } : {}),
    ...(tzId !== undefined ? { tzId } : {}),
    value: raw,
  };
}

export function decodeTemporalV1(bytes: Uint8Array): NormalizedIcalDateTime {
  const reader = new BytesReader(bytes);
  const value = readTemporalFrom(reader);
  reader.assertConsumed();
  return value;
}

function writeIdentityPrefix(builder: BytesBuilder, kindCode: number): void {
  builder.writeUtf8Tagged(IDENTITY_TAG);
  builder.writeU8(kindCode);
}

function buildAnonymousFingerprint(
  input: IdentityBuildInput,
  uidDigest: Uint8Array | null,
): Uint8Array {
  const builder = new BytesBuilder();
  builder.writeUtf8Tagged(ANON_TAG);
  if (input.interval === null) {
    builder.writeU8(0);
  } else {
    builder.writeU8(1);
    // structured only (no raw) for anon interval identity
    const start = input.interval.start;
    const end = input.interval.end;
    builder.writeU8(start.kind === "date" ? 1 : 2);
    builder.writeU32(start.year);
    builder.writeU8(start.month);
    builder.writeU8(start.day);
    if (start.kind !== "date") {
      builder.writeU8(start.hour ?? 0);
      builder.writeU8(start.minute ?? 0);
      builder.writeU8(start.second ?? 0);
    }
    builder.writeU8(end.kind === "date" ? 1 : 2);
    builder.writeU32(end.year);
    builder.writeU8(end.month);
    builder.writeU8(end.day);
    if (end.kind !== "date") {
      builder.writeU8(end.hour ?? 0);
      builder.writeU8(end.minute ?? 0);
      builder.writeU8(end.second ?? 0);
    }
  }
  builder.writeBool(input.flags.hasRrule);
  builder.writeBool(input.flags.hasRdate);
  builder.writeBool(input.flags.hasExdate);
  builder.writeBool(input.flags.hasRecurrenceId);
  builder.writeBool(input.flags.durationPresent);
  if (input.recurrenceId !== null) {
    const temporal = encodeTemporalV1(input.recurrenceId);
    if (temporal.byteLength <= ICAL_MAP_LIMITS.maxDirectTemporalIdentityBytes) {
      builder.writeU8(1);
      builder.writeBytes(temporal);
    } else {
      builder.writeU8(2);
      builder.writeBytes(sha256Bytes(temporal));
    }
  } else {
    builder.writeU8(0);
  }
  builder.writeBool(input.equalityFlags.identityInvalid);
  builder.writeBool(input.equalityFlags.duplicateUidProperty);
  if (uidDigest !== null) {
    builder.writeU8(1);
    builder.writeBytes(uidDigest);
  } else {
    builder.writeU8(0);
  }
  return sha256Bytes(builder.toUint8Array());
}

export function buildEventIdentity(input: IdentityBuildInput): IdentityBuildResult {
  const flags = { ...input.equalityFlags };
  const uid = input.uid;
  const rid = input.recurrenceId;

  if (uid !== null) {
    const uidBytes = utf8ByteLength(uid);
    if (uidBytes > ICAL_MAP_LIMITS.maxDirectUidUtf8Bytes) {
      flags.identityInvalid = true;
      const fingerprint = buildAnonymousFingerprint(input, sha256Bytes(encodeUtf8(uid)));
      return finishIdentity("anonymous_hashed_uid", fingerprint, null, flags, (b) => {
        writeIdentityPrefix(b, ICAL_IDENTITY_KIND_CODE.anonymous_hashed_uid);
        b.writeLengthPrefixedBytes(fingerprint);
      });
    }

    if (rid !== null) {
      const temporal = encodeTemporalV1(rid);
      if (temporal.byteLength <= ICAL_MAP_LIMITS.maxDirectTemporalIdentityBytes) {
        return finishIdentity("uid_rid", null, uid, flags, (b) => {
          writeIdentityPrefix(b, ICAL_IDENTITY_KIND_CODE.uid_rid);
          b.writeLengthPrefixedUtf8(uid);
          b.writeBytes(temporal);
        });
      }
      flags.recurrenceIdentityHashed = true;
      const digest = sha256Bytes(temporal);
      return finishIdentity("uid_rid_hashed", null, uid, flags, (b) => {
        writeIdentityPrefix(b, ICAL_IDENTITY_KIND_CODE.uid_rid_hashed);
        b.writeLengthPrefixedUtf8(uid);
        b.writeLengthPrefixedBytes(digest);
      });
    }

    return finishIdentity("uid_only", null, uid, flags, (b) => {
      writeIdentityPrefix(b, ICAL_IDENTITY_KIND_CODE.uid_only);
      b.writeLengthPrefixedUtf8(uid);
    });
  }

  // missing / null UID
  const fingerprint = buildAnonymousFingerprint(input, null);
  return finishIdentity("anonymous", fingerprint, null, flags, (b) => {
    writeIdentityPrefix(b, ICAL_IDENTITY_KIND_CODE.anonymous);
    b.writeLengthPrefixedBytes(fingerprint);
  });
}

function finishIdentity(
  kind: IcalIdentityKind,
  _fingerprint: Uint8Array | null,
  providerEventId: string | null,
  equalityFlags: IcalEqualityFlags,
  write: (builder: BytesBuilder) => void,
): IdentityBuildResult {
  const builder = new BytesBuilder();
  write(builder);
  const binary = builder.toUint8Array();
  if (binary.byteLength > ICAL_MAP_LIMITS.maxIdentityBinaryBytes) {
    throw new IcalMapError(
      "ICAL_MAP_IDENTITY_INVARIANT",
      "Identity encoding exceeded hard binary limit",
      { limitKey: "maxIdentityBinaryBytes" },
    );
  }
  const identityKey = encodeBase64Url(binary);
  if (utf8ByteLength(identityKey) > ICAL_MAP_LIMITS.maxIdentityBase64urlBytes) {
    throw new IcalMapError(
      "ICAL_MAP_IDENTITY_INVARIANT",
      "Identity encoding exceeded hard base64url limit",
      { limitKey: "maxIdentityBase64urlBytes" },
    );
  }
  return {
    identityKey,
    identityKind: kind,
    providerEventId,
    equalityFlags,
    binary,
  };
}

export function decodeIcalIdentityKey(identityKey: string): IcalDecodedIdentity | null {
  try {
    const binary = decodeBase64Url(identityKey);
    if (binary === null) {
      return null;
    }
    return decodeIdentityBinary(binary);
  } catch {
    return null;
  }
}

export function decodeIdentityBinary(binary: Uint8Array): IcalDecodedIdentity {
  const reader = new BytesReader(binary);
  reader.expectExactTag(IDENTITY_TAG);
  const kindCode = reader.readU8();
  switch (kindCode) {
    case ICAL_IDENTITY_KIND_CODE.uid_only: {
      const uid = reader.readLengthPrefixedUtf8();
      reader.assertConsumed();
      return {
        kind: "uid_only",
        uid,
        providerEventId: uid,
        recurrenceId: null,
        recurrenceIdentityHashed: false,
      };
    }
    case ICAL_IDENTITY_KIND_CODE.uid_rid: {
      const uid = reader.readLengthPrefixedUtf8();
      const recurrenceId = readTemporalFrom(reader);
      reader.assertConsumed();
      return {
        kind: "uid_rid",
        uid,
        providerEventId: uid,
        recurrenceId,
        recurrenceIdentityHashed: false,
      };
    }
    case ICAL_IDENTITY_KIND_CODE.uid_rid_hashed: {
      const uid = reader.readLengthPrefixedUtf8();
      const digest = reader.readLengthPrefixedBytes();
      if (digest.byteLength !== 32) {
        throw new RangeError("bad temporal digest");
      }
      reader.assertConsumed();
      return {
        kind: "uid_rid_hashed",
        uid,
        providerEventId: uid,
        recurrenceId: null,
        recurrenceIdentityHashed: true,
        temporalDigestHex: hexFromBytes(digest),
      };
    }
    case ICAL_IDENTITY_KIND_CODE.anonymous:
    case ICAL_IDENTITY_KIND_CODE.anonymous_hashed_uid: {
      const fingerprint = reader.readLengthPrefixedBytes();
      if (fingerprint.byteLength !== 32) {
        throw new RangeError("bad fingerprint");
      }
      reader.assertConsumed();
      return {
        kind:
          kindCode === ICAL_IDENTITY_KIND_CODE.anonymous
            ? "anonymous"
            : "anonymous_hashed_uid",
        uid: null,
        providerEventId: null,
        recurrenceId: null,
        recurrenceIdentityHashed: false,
        fingerprintHex: hexFromBytes(fingerprint),
      };
    }
    default:
      throw new RangeError("unknown identity kind");
  }
}
