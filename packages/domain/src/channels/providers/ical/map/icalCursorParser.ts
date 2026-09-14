import { utf8ByteLength } from "../../../utils/sha256Hex";
import { decodeIcalIdentityKey } from "./icalIdentityCodec";
import { ICAL_MAP_LIMITS } from "./icalMapLimits";
import type { IcalCursorDecodeResult } from "./icalMapTypes";
import {
  ICAL_CURSOR_CODEC_VERSION,
  ICAL_ENTRY_HASH_VERSION,
  ICAL_IDENTITY_CODEC_VERSION,
  ICAL_SNAPSHOT_HASH_VERSION,
  ICAL_SNAPSHOT_SCHEMA_VERSION,
} from "./icalMapTypes";

type VersionField = "v" | "ss" | "iv" | "eh" | "sh";

const ROOT_VERSION_FIELDS: VersionField[] = ["v", "ss", "iv", "eh", "sh"];

const EXPECTED_VERSIONS: Record<VersionField, number> = {
  v: ICAL_CURSOR_CODEC_VERSION,
  ss: ICAL_SNAPSHOT_SCHEMA_VERSION,
  iv: ICAL_IDENTITY_CODEC_VERSION,
  eh: ICAL_ENTRY_HASH_VERSION,
  sh: ICAL_SNAPSHOT_HASH_VERSION,
};

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Bounded fixed-grammar cursor parser.
 * Rejects duplicate keys, unknown keys, wrong types, and non-canonical ordering.
 * Enforces resource limits incrementally during parse (not after full tree materialization).
 */
export function parseIcalCursorPayload(payload: string): IcalCursorDecodeResult {
  if (utf8ByteLength(payload) > ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes) {
    return { status: "invalid", issueCode: "CURSOR_INVALID" };
  }
  if (payload.length === 0) {
    return { status: "invalid", issueCode: "CURSOR_INVALID" };
  }
  try {
    const parser = new CursorPayloadParser(payload);
    return parser.parse();
  } catch (error) {
    if (error instanceof CursorParseFailure) {
      return error.result;
    }
    return { status: "invalid", issueCode: "CURSOR_INVALID" };
  }
}

class CursorParseFailure extends Error {
  constructor(readonly result: IcalCursorDecodeResult) {
    super("cursor parse failure");
  }
}

function invalid(): never {
  throw new CursorParseFailure({ status: "invalid", issueCode: "CURSOR_INVALID" });
}

function unsupported(field: VersionField): never {
  throw new CursorParseFailure({
    status: "unsupported",
    issueCode: "CURSOR_UNSUPPORTED_VERSION",
    unsupportedField: field,
  });
}

/**
 * Incremental cursor payload parser — no generic JSON tree for groups/hashes.
 */
class CursorPayloadParser {
  private i = 0;
  private groupCount = 0;
  private totalDigestCount = 0;

  constructor(private readonly input: string) {}

  parse(): IcalCursorDecodeResult {
    this.skipWsForbidden();
    this.expectChar("{");

    for (let idx = 0; idx < ROOT_VERSION_FIELDS.length; idx += 1) {
      const field = ROOT_VERSION_FIELDS[idx]!;
      if (idx > 0) {
        this.expectComma();
      }
      this.expectKey(field);
      this.expectChar(":");
      const value = this.parseInteger();
      if (value !== EXPECTED_VERSIONS[field]) {
        unsupported(field);
      }
    }

    this.expectComma();
    this.expectKey("s");
    this.expectChar(":");
    const snapshotHash = this.parseHex64String();

    this.expectComma();
    this.expectKey("g");
    this.expectChar(":");
    const groups = this.parseGroupsArray();

    this.skipWsForbidden();
    this.expectChar("}");
    this.expectEof();

    return {
      status: "valid",
      index: {
        cursorCodecVersion: ICAL_CURSOR_CODEC_VERSION,
        snapshotSchemaVersion: ICAL_SNAPSHOT_SCHEMA_VERSION,
        identityCodecVersion: ICAL_IDENTITY_CODEC_VERSION,
        entryHashVersion: ICAL_ENTRY_HASH_VERSION,
        snapshotHashVersion: ICAL_SNAPSHOT_HASH_VERSION,
        snapshotHash,
        groups,
      },
    };
  }

  private parseGroupsArray(): Array<{ identityKey: string; entryContentHashes: string[] }> {
    this.expectChar("[");
    this.skipWsForbidden();

    const groups: Array<{ identityKey: string; entryContentHashes: string[] }> = [];
    let previousIdentity: string | null = null;

    if (this.peek() === "]") {
      this.i += 1;
      return groups;
    }

    for (;;) {
      this.groupCount += 1;
      if (this.groupCount > ICAL_MAP_LIMITS.maxGroups) {
        invalid();
      }

      const group = this.parseGroupObject();
      if (previousIdentity !== null && group.identityKey < previousIdentity) {
        invalid();
      }
      previousIdentity = group.identityKey;
      groups.push(group);

      this.skipWsForbidden();
      if (this.peek() === ",") {
        this.i += 1;
        continue;
      }
      if (this.peek() === "]") {
        this.i += 1;
        return groups;
      }
      invalid();
    }
  }

  private parseGroupObject(): { identityKey: string; entryContentHashes: string[] } {
    this.skipWsForbidden();
    this.expectChar("{");

    this.expectKey("i");
    this.expectChar(":");
    const identityKey = this.parseIdentityKeyString();
    if (decodeIcalIdentityKey(identityKey) === null) {
      invalid();
    }

    this.expectComma();
    this.expectKey("h");
    this.expectChar(":");
    const entryContentHashes = this.parseHashesArray();

    this.skipWsForbidden();
    this.expectChar("}");

    return { identityKey, entryContentHashes };
  }

  private parseHashesArray(): string[] {
    this.expectChar("[");
    this.skipWsForbidden();

    if (this.peek() === "]") {
      invalid();
    }

    const hashes: string[] = [];
    let currentGroupHashCount = 0;
    let previousHash: string | null = null;

    for (;;) {
      currentGroupHashCount += 1;
      if (currentGroupHashCount > ICAL_MAP_LIMITS.maxHashesPerGroup) {
        invalid();
      }

      this.totalDigestCount += 1;
      if (this.totalDigestCount > ICAL_MAP_LIMITS.maxTotalDigests) {
        invalid();
      }

      const hash = this.parseHex64String();
      if (previousHash !== null && hash < previousHash) {
        invalid();
      }
      previousHash = hash;
      hashes.push(hash);

      this.skipWsForbidden();
      if (this.peek() === ",") {
        this.i += 1;
        continue;
      }
      if (this.peek() === "]") {
        this.i += 1;
        return hashes;
      }
      invalid();
    }
  }

  /** Exactly 64 lowercase hex characters inside JSON quotes. */
  private parseHex64String(): string {
    this.expectChar('"');
    let out = "";
    for (let n = 0; n < 64; n += 1) {
      const ch = this.input[this.i];
      if (ch === undefined) {
        invalid();
      }
      const code = ch.charCodeAt(0);
      const isDigit = code >= 0x30 && code <= 0x39;
      const isLowerHex = code >= 0x61 && code <= 0x66;
      if (!isDigit && !isLowerHex) {
        invalid();
      }
      out += ch;
      this.i += 1;
    }
    if (this.input[this.i] !== '"') {
      invalid();
    }
    this.i += 1;
    if (!HEX64.test(out)) {
      invalid();
    }
    return out;
  }

  /** Base64url identity key bounded before identity binary decode. */
  private parseIdentityKeyString(): string {
    this.expectChar('"');
    let out = "";
    while (this.i < this.input.length) {
      const ch = this.input[this.i]!;
      if (ch === '"') {
        if (out.length === 0) {
          invalid();
        }
        this.i += 1;
        return out;
      }
      if (ch === "\\" || ch.charCodeAt(0) < 0x20) {
        invalid();
      }
      if (out.length >= ICAL_MAP_LIMITS.maxIdentityBase64urlBytes) {
        invalid();
      }
      out += ch;
      this.i += 1;
    }
    invalid();
  }

  private expectComma(): void {
    this.skipWsForbidden();
    this.expectChar(",");
  }

  private expectKey(expected: string): void {
    this.skipWsForbidden();
    this.expectChar('"');
    for (let j = 0; j < expected.length; j += 1) {
      if (this.input[this.i] !== expected[j]) {
        invalid();
      }
      this.i += 1;
    }
    if (this.input[this.i] !== '"') {
      invalid();
    }
    this.i += 1;
  }

  private parseInteger(): number {
    this.skipWsForbidden();
    const start = this.i;
    if (this.peek() === "-") {
      this.i += 1;
    }
    if (this.peek() < "0" || this.peek() > "9") {
      invalid();
    }
    while (this.peek() >= "0" && this.peek() <= "9") {
      this.i += 1;
    }
    if (this.peek() === "." || this.peek() === "e" || this.peek() === "E") {
      invalid();
    }
    const text = this.input.slice(start, this.i);
    if (text.length > 1 && text.startsWith("0")) {
      invalid();
    }
    if (text.length > 2 && text.startsWith("-0")) {
      invalid();
    }
    const value = Number(text);
    if (!Number.isInteger(value)) {
      invalid();
    }
    return value;
  }

  private expectEof(): void {
    this.skipWsForbidden();
    if (this.i !== this.input.length) {
      invalid();
    }
  }

  private peek(): string {
    return this.input[this.i] ?? "";
  }

  private expectChar(ch: string): void {
    this.skipWsForbidden();
    if (this.input[this.i] !== ch) {
      invalid();
    }
    this.i += 1;
  }

  /** Canonical cursor JSON forbids whitespace. */
  private skipWsForbidden(): void {
    const ch = this.peek();
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      invalid();
    }
  }
}
