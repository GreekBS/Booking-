import { encodeUtf8, sha256HexBytes } from "../../../utils/sha256Hex";
import type { NormalizedIcalProperty } from "../parse/icalParseTypes";
import { BytesBuilder } from "./icalCanonicalEncoding";

export type RecurrencePropertyFamily = "RRULE" | "RDATE" | "EXDATE" | "DURATION";

export function collectPropertyDigests(
  properties: readonly NormalizedIcalProperty[],
  family: RecurrencePropertyFamily,
): string[] {
  const matches = properties
    .filter((property) => property.name === family)
    .slice()
    .sort((a, b) => a.propertyIndex - b.propertyIndex);
  return matches.map((property) => digestProperty(property));
}

export function digestProperty(property: NormalizedIcalProperty): string {
  const builder = new BytesBuilder();
  builder.writeUtf8Tagged("ical-prop-digest-v1");
  builder.writeLengthPrefixedUtf8(property.name);
  builder.writeU32(property.parameters.length);
  for (const parameter of property.parameters) {
    builder.writeLengthPrefixedUtf8(parameter.name);
    builder.writeU32(parameter.values.length);
    for (const value of parameter.values) {
      builder.writeLengthPrefixedUtf8(value);
    }
  }
  builder.writeLengthPrefixedUtf8(property.value);
  return sha256HexBytes(builder.toUint8Array());
}

export function hasNamedProperty(
  properties: readonly NormalizedIcalProperty[],
  name: string,
): boolean {
  return properties.some((property) => property.name === name);
}

export function countNamedProperties(
  properties: readonly NormalizedIcalProperty[],
  name: string,
): number {
  return properties.reduce(
    (count, property) => (property.name === name ? count + 1 : count),
    0,
  );
}

/** Used only for local preimage construction of property names. */
export function utf8PropertyNameBytes(name: string): Uint8Array {
  return encodeUtf8(name);
}
