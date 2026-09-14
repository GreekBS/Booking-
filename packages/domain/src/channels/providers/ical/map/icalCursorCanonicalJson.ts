import { utf8ByteLength } from "../../../utils/sha256Hex";
import { isLowercaseHex64 } from "./icalCanonicalEncoding";
import { IcalMapError } from "./icalMapErrors";
import { ICAL_MAP_LIMITS } from "./icalMapLimits";
import type { IcalDigestIndex } from "./icalMapTypes";
import { decodeIcalIdentityKey } from "./icalIdentityCodec";

/**
 * Explicit canonical cursor JSON serializer (fixed key order, no whitespace).
 */
export function serializeIcalCursorCanonical(digest: IcalDigestIndex): string {
  if (digest.groups.length > ICAL_MAP_LIMITS.maxGroups) {
    throw new IcalMapError(
      "ICAL_MAP_LIMIT_EXCEEDED",
      "Cursor group count exceeded hard limit",
      { limitKey: "maxGroups" },
    );
  }

  let totalDigests = 0;
  const groupJson: string[] = [];
  for (const group of digest.groups) {
    if (group.entryContentHashes.length === 0) {
      throw new IcalMapError(
        "ICAL_MAP_CURSOR_ENCODE_FAILED",
        "Cursor group hash list must not be empty",
      );
    }
    if (group.entryContentHashes.length > ICAL_MAP_LIMITS.maxHashesPerGroup) {
      throw new IcalMapError(
        "ICAL_MAP_LIMIT_EXCEEDED",
        "Cursor hashes per group exceeded hard limit",
        { limitKey: "maxHashesPerGroup" },
      );
    }
    totalDigests += group.entryContentHashes.length;
    if (totalDigests > ICAL_MAP_LIMITS.maxTotalDigests) {
      throw new IcalMapError(
        "ICAL_MAP_LIMIT_EXCEEDED",
        "Cursor total digest count exceeded hard limit",
        { limitKey: "maxTotalDigests" },
      );
    }
    if (!isLowercaseHex64(digest.snapshotHash)) {
      throw new IcalMapError("ICAL_MAP_HASH_INVARIANT", "Snapshot hash is not valid hex");
    }
    if (decodeIcalIdentityKey(group.identityKey) === null) {
      throw new IcalMapError(
        "ICAL_MAP_IDENTITY_INVARIANT",
        "Cursor identity key failed decode validation",
      );
    }
    for (const hash of group.entryContentHashes) {
      if (!isLowercaseHex64(hash)) {
        throw new IcalMapError("ICAL_MAP_HASH_INVARIANT", "Entry hash is not valid hex");
      }
    }

    // Verify sort invariants for encode path
    for (let i = 1; i < group.entryContentHashes.length; i += 1) {
      if (group.entryContentHashes[i]! < group.entryContentHashes[i - 1]!) {
        throw new IcalMapError(
          "ICAL_MAP_CURSOR_ENCODE_FAILED",
          "Cursor group hashes must be sorted",
        );
      }
    }

    const hashes = group.entryContentHashes.map((hash) => `"${hash}"`).join(",");
    groupJson.push(`{"i":"${group.identityKey}","h":[${hashes}]}`);
  }

  for (let i = 1; i < digest.groups.length; i += 1) {
    if (digest.groups[i]!.identityKey < digest.groups[i - 1]!.identityKey) {
      throw new IcalMapError(
        "ICAL_MAP_CURSOR_ENCODE_FAILED",
        "Cursor groups must be sorted by identity key",
      );
    }
  }

  if (!isLowercaseHex64(digest.snapshotHash)) {
    throw new IcalMapError("ICAL_MAP_HASH_INVARIANT", "Snapshot hash is not valid hex");
  }

  const payload =
    `{"v":${digest.cursorCodecVersion},` +
    `"ss":${digest.snapshotSchemaVersion},` +
    `"iv":${digest.identityCodecVersion},` +
    `"eh":${digest.entryHashVersion},` +
    `"sh":${digest.snapshotHashVersion},` +
    `"s":"${digest.snapshotHash}",` +
    `"g":[${groupJson.join(",")}]}`;

  if (utf8ByteLength(payload) > ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes) {
    throw new IcalMapError(
      "ICAL_MAP_LIMIT_EXCEEDED",
      "Encoded cursor exceeded hard UTF-8 payload limit",
      { limitKey: "maxCursorPayloadUtf8Bytes" },
    );
  }

  return payload;
}
