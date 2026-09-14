import { encodeUtf8 } from "../../../utils/sha256Hex";

/** Growable binary buffer for TLV construction. */
export class BytesBuilder {
  private chunks: Uint8Array[] = [];
  private length = 0;

  writeU8(value: number): void {
    this.writeBytes(Uint8Array.of(value & 0xff));
  }

  writeU32(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError("u32 out of range");
    }
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, false);
    this.writeBytes(buf);
  }

  writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.byteLength;
  }

  writeUtf8Tagged(tag: string): void {
    const bytes = encodeUtf8(tag);
    this.writeU32(bytes.byteLength);
    this.writeBytes(bytes);
  }

  writeLengthPrefixedUtf8(value: string): void {
    const bytes = encodeUtf8(value);
    this.writeU32(bytes.byteLength);
    this.writeBytes(bytes);
  }

  writeLengthPrefixedBytes(bytes: Uint8Array): void {
    this.writeU32(bytes.byteLength);
    this.writeBytes(bytes);
  }

  writeBool(value: boolean): void {
    this.writeU8(value ? 1 : 0);
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
}

export class BytesReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  get position(): number {
    return this.offset;
  }

  readU8(): number {
    if (this.offset >= this.bytes.byteLength) {
      throw new RangeError("unexpected end");
    }
    const value = this.bytes[this.offset]!;
    this.offset += 1;
    return value;
  }

  readU32(): number {
    if (this.offset + 4 > this.bytes.byteLength) {
      throw new RangeError("unexpected end");
    }
    const view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offset,
      4,
    );
    const value = view.getUint32(0, false);
    this.offset += 4;
    return value;
  }

  readBytes(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.bytes.byteLength) {
      throw new RangeError("unexpected end");
    }
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readLengthPrefixedBytes(): Uint8Array {
    const length = this.readU32();
    return this.readBytes(length);
  }

  readLengthPrefixedUtf8(): string {
    const bytes = this.readLengthPrefixedBytes();
    return decodeUtf8(bytes);
  }

  expectExactTag(expected: string): void {
    const tag = this.readLengthPrefixedUtf8();
    if (tag !== expected) {
      throw new RangeError("tag mismatch");
    }
  }

  assertConsumed(): void {
    if (this.remaining !== 0) {
      throw new RangeError("trailing bytes");
    }
  }
}

export function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b0 = bytes[i]!;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if (b0 >= 0xc2 && b0 <= 0xdf && i + 1 < bytes.length) {
      const b1 = bytes[++i]!;
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if (b0 >= 0xe0 && b0 <= 0xef && i + 2 < bytes.length) {
      const b1 = bytes[++i]!;
      const b2 = bytes[++i]!;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
    } else if (b0 >= 0xf0 && b0 <= 0xf4 && i + 3 < bytes.length) {
      const b1 = bytes[++i]!;
      const b2 = bytes[++i]!;
      const b3 = bytes[++i]!;
      const code =
        ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      const adjusted = code - 0x10000;
      out += String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
    } else {
      throw new RangeError("invalid utf-8");
    }
  }
  return out;
}

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64URL_ALPHABET[(triple >> 18) & 63]!;
    out += BASE64URL_ALPHABET[(triple >> 12) & 63]!;
    if (i + 1 < bytes.length) {
      out += BASE64URL_ALPHABET[(triple >> 6) & 63]!;
    }
    if (i + 2 < bytes.length) {
      out += BASE64URL_ALPHABET[triple & 63]!;
    }
  }
  return out;
}

export function decodeBase64Url(value: string): Uint8Array | null {
  if (value.length === 0) {
    return new Uint8Array(0);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  const pad = (4 - (value.length % 4)) % 4;
  if (pad === 3) {
    return null;
  }
  const padded = value + "=".repeat(pad);
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = BASE64URL_ALPHABET.indexOf(padded[i]!);
    const c1 = BASE64URL_ALPHABET.indexOf(padded[i + 1]!);
    const c2 = padded[i + 2] === "=" ? 0 : BASE64URL_ALPHABET.indexOf(padded[i + 2]!);
    const c3 = padded[i + 3] === "=" ? 0 : BASE64URL_ALPHABET.indexOf(padded[i + 3]!);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      return null;
    }
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out.push((triple >> 16) & 0xff);
    if (padded[i + 2] !== "=") {
      out.push((triple >> 8) & 0xff);
    }
    if (padded[i + 3] !== "=") {
      out.push(triple & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesFromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function isLowercaseHex64(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function compareUtf8Ascii(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function sortStringsAsc(values: readonly string[]): string[] {
  return [...values].sort(compareUtf8Ascii);
}
