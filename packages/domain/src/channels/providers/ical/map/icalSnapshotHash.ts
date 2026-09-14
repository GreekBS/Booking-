import { sha256HexBytes } from "../../../utils/sha256Hex";
import { BytesBuilder, decodeBase64Url } from "./icalCanonicalEncoding";
import { encodeEqualityBitfield } from "./icalEqualityFlags";
import { writeIntervalCanon } from "./icalInterval";
import { IcalMapError } from "./icalMapErrors";
import type {
  IcalEqualityFlags,
  IcalSnapshotEntry,
  IcalSnapshotGroup,
  IcalSnapshotInterval,
  IcalStructuralFlags,
} from "./icalMapTypes";

export function computeEntryContentHash(input: {
  sequence: number | null;
  status: string | null;
  interval: IcalSnapshotInterval | null;
  flags: IcalStructuralFlags;
  rruleDigests: readonly string[];
  rdateDigests: readonly string[];
  exdateDigests: readonly string[];
  durationDigests: readonly string[];
  equalityFlags: IcalEqualityFlags;
}): string {
  const builder = new BytesBuilder();
  builder.writeUtf8Tagged("ical-entry-hash-v1");
  if (input.sequence === null) {
    builder.writeU8(0);
  } else {
    builder.writeU8(1);
    builder.writeU32(input.sequence);
  }
  if (input.status === null) {
    builder.writeU8(0);
  } else {
    builder.writeU8(1);
    builder.writeLengthPrefixedUtf8(input.status);
  }
  writeIntervalCanon(builder, input.interval);
  builder.writeBool(input.flags.hasRrule);
  builder.writeBool(input.flags.hasRdate);
  builder.writeBool(input.flags.hasExdate);
  builder.writeBool(input.flags.hasRecurrenceId);
  builder.writeBool(input.flags.durationPresent);
  writeDigestArray(builder, input.rruleDigests);
  writeDigestArray(builder, input.rdateDigests);
  writeDigestArray(builder, input.exdateDigests);
  writeDigestArray(builder, input.durationDigests);
  builder.writeU32(encodeEqualityBitfield(input.equalityFlags));
  return sha256HexBytes(builder.toUint8Array());
}

function writeDigestArray(builder: BytesBuilder, digests: readonly string[]): void {
  builder.writeU32(digests.length);
  for (const digest of digests) {
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new IcalMapError("ICAL_MAP_HASH_INVARIANT", "Invalid digest hex in entry hash");
    }
    const bytes = hexToBytes(digest);
    builder.writeBytes(bytes);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function computeSnapshotHash(groups: readonly IcalSnapshotGroup[]): string {
  const builder = new BytesBuilder();
  builder.writeUtf8Tagged("ical-snapshot-hash-v1");
  builder.writeU32(groups.length);
  for (const group of groups) {
    const identityBinary = decodeBase64Url(group.identityKey);
    if (identityBinary === null) {
      throw new IcalMapError(
        "ICAL_MAP_IDENTITY_INVARIANT",
        "Snapshot group identity key was not decodable",
      );
    }
    builder.writeLengthPrefixedBytes(identityBinary);
    builder.writeU32(group.entryContentHashes.length);
    for (const hash of group.entryContentHashes) {
      if (!/^[0-9a-f]{64}$/.test(hash)) {
        throw new IcalMapError("ICAL_MAP_HASH_INVARIANT", "Invalid entry hash in snapshot");
      }
      builder.writeBytes(hexToBytes(hash));
    }
  }
  return sha256HexBytes(builder.toUint8Array());
}

export function buildCanonicalGroups(
  entries: readonly IcalSnapshotEntry[],
): IcalSnapshotGroup[] {
  const byKey = new Map<string, { indexes: number[]; hashes: string[] }>();
  entries.forEach((entry, index) => {
    const existing = byKey.get(entry.identityKey);
    if (existing) {
      existing.indexes.push(index);
      existing.hashes.push(entry.entryContentHash);
    } else {
      byKey.set(entry.identityKey, {
        indexes: [index],
        hashes: [entry.entryContentHash],
      });
    }
  });

  const keys = [...byKey.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return keys.map((identityKey) => {
    const group = byKey.get(identityKey)!;
    const entryContentHashes = [...group.hashes].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return {
      identityKey,
      entryIndexes: group.indexes,
      entryContentHashes,
    };
  });
}
