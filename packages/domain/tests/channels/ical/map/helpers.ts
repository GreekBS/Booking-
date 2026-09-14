import type {
  NormalizedIcalCalendar,
  NormalizedIcalEvent,
  NormalizedIcalProperty,
  NormalizedIcalDateTime,
  NormalizedIcalIssue,
} from "../../../../src/channels/providers/ical/parse/icalParseTypes";
import type { IcalParseIssueCode } from "../../../../src/channels/providers/ical/parse/icalParseIssueCodes";

export function dateValue(ymd: string): NormalizedIcalDateTime {
  return {
    kind: "date",
    year: Number(ymd.slice(0, 4)),
    month: Number(ymd.slice(4, 6)),
    day: Number(ymd.slice(6, 8)),
    value: ymd,
  };
}

export function utcValue(raw: string): NormalizedIcalDateTime {
  // YYYYMMDDTHHMMSSZ
  return {
    kind: "dateTimeUtc",
    year: Number(raw.slice(0, 4)),
    month: Number(raw.slice(4, 6)),
    day: Number(raw.slice(6, 8)),
    hour: Number(raw.slice(9, 11)),
    minute: Number(raw.slice(11, 13)),
    second: Number(raw.slice(13, 15)),
    value: raw,
  };
}

export function prop(
  name: string,
  value: string,
  propertyIndex: number,
  parameters: NormalizedIcalProperty["parameters"] = [],
): NormalizedIcalProperty {
  return { name, value, propertyIndex, parameters };
}

export function makeEvent(
  overrides: Partial<NormalizedIcalEvent> & { eventIndex: number },
): NormalizedIcalEvent {
  const eventIndex = overrides.eventIndex;
  const properties = overrides.properties ?? [];
  return {
    name: "VEVENT",
    componentIndex: overrides.componentIndex ?? eventIndex,
    eventIndex,
    properties,
    components: overrides.components ?? [],
    issues: overrides.issues ?? [],
    uid: overrides.uid !== undefined ? overrides.uid : `uid-${eventIndex}@example.com`,
    sequence: overrides.sequence !== undefined ? overrides.sequence : 0,
    status: overrides.status !== undefined ? overrides.status : "CONFIRMED",
    summary: overrides.summary ?? null,
    description: overrides.description ?? null,
    location: overrides.location ?? null,
    dtstart: overrides.dtstart !== undefined ? overrides.dtstart : dateValue("20260101"),
    dtend: overrides.dtend !== undefined ? overrides.dtend : dateValue("20260102"),
    recurrenceId: overrides.recurrenceId !== undefined ? overrides.recurrenceId : null,
    dtstamp: overrides.dtstamp ?? null,
    created: overrides.created ?? null,
    lastModified: overrides.lastModified ?? null,
  };
}

export function makeCalendar(
  events: NormalizedIcalEvent[],
  issues: NormalizedIcalIssue[] = [],
): NormalizedIcalCalendar {
  return {
    rawByteLength: 100,
    prodid: "-//Test//EN",
    version: "2.0",
    calscale: "GREGORIAN",
    method: null,
    properties: [],
    components: events,
    events,
    issues,
  };
}

export function issue(
  code: IcalParseIssueCode,
  extra: Partial<NormalizedIcalIssue> = {},
): NormalizedIcalIssue {
  return { code, ...extra };
}
