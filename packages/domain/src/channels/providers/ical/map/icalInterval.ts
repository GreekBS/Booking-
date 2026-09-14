import type { NormalizedIcalDateTime, NormalizedIcalEvent } from "../parse/icalParseTypes";
import type { IcalSnapshotInterval } from "./icalMapTypes";
import { BytesBuilder } from "./icalCanonicalEncoding";

export function resolveStructuralInterval(
  event: NormalizedIcalEvent,
): IcalSnapshotInterval | null {
  const start = event.dtstart;
  const end = event.dtend;
  if (start === null || end === null) {
    return null;
  }
  if (start.kind === "date" && end.kind === "date") {
    if (!isDateStrictlyBefore(start, end)) {
      return null;
    }
    return { start, end, endSource: "dtend", resolvable: true };
  }
  if (start.kind === "dateTimeUtc" && end.kind === "dateTimeUtc") {
    if (!isDateTimeUtcStrictlyBefore(start, end)) {
      return null;
    }
    return { start, end, endSource: "dtend", resolvable: true };
  }
  return null;
}

function isDateStrictlyBefore(a: NormalizedIcalDateTime, b: NormalizedIcalDateTime): boolean {
  if (a.year !== b.year) return a.year < b.year;
  if (a.month !== b.month) return a.month < b.month;
  return a.day < b.day;
}

function isDateTimeUtcStrictlyBefore(
  a: NormalizedIcalDateTime,
  b: NormalizedIcalDateTime,
): boolean {
  if (isDateStrictlyBefore(a, b)) return true;
  if (a.year !== b.year || a.month !== b.month || a.day !== b.day) return false;
  const ah = a.hour ?? 0;
  const am = a.minute ?? 0;
  const as = a.second ?? 0;
  const bh = b.hour ?? 0;
  const bm = b.minute ?? 0;
  const bs = b.second ?? 0;
  if (ah !== bh) return ah < bh;
  if (am !== bm) return am < bm;
  return as < bs;
}

/** Structured interval equality encoding (no `.raw`). */
export function writeIntervalCanon(
  builder: BytesBuilder,
  interval: IcalSnapshotInterval | null,
): void {
  if (interval === null) {
    builder.writeUtf8Tagged("ical-interval-v1");
    builder.writeU8(0); // unresolved
    return;
  }
  builder.writeUtf8Tagged("ical-interval-v1");
  builder.writeU8(1); // resolved
  writeStructuredTemporal(builder, interval.start);
  writeStructuredTemporal(builder, interval.end);
  builder.writeU8(interval.endSource === "dtend" ? 1 : 0);
}

function writeStructuredTemporal(builder: BytesBuilder, value: NormalizedIcalDateTime): void {
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
}
