/** Portable UTF-8 byte helpers without Node-specific APIs. */

export function encodeUtf8Bytes(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);

    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return new Uint8Array(bytes);
}

export function decodeUtf8Bytes(bytes: Uint8Array): string {
  let result = "";
  let index = 0;

  while (index < bytes.length) {
    const byte1 = bytes[index]!;
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
      index += 1;
      continue;
    }

    if ((byte1 & 0xe0) === 0xc0) {
      const byte2 = bytes[index + 1]!;
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
      index += 2;
      continue;
    }

    if ((byte1 & 0xf0) === 0xe0) {
      const byte2 = bytes[index + 1]!;
      const byte3 = bytes[index + 2]!;
      result += String.fromCharCode(
        ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f),
      );
      index += 3;
      continue;
    }

    const byte2 = bytes[index + 1]!;
    const byte3 = bytes[index + 2]!;
    const byte4 = bytes[index + 3]!;
    const codePoint =
      ((byte1 & 0x07) << 18) |
      ((byte2 & 0x3f) << 12) |
      ((byte3 & 0x3f) << 6) |
      (byte4 & 0x3f);
    const offset = codePoint - 0x10000;
    result += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
    index += 4;
  }

  return result;
}
