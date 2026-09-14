import { decodeIcalTextValue } from "./decodeIcalText";
import type { IcalParseIssueCode } from "./icalParseIssueCodes";
import {
  normalizeIcalDateTime,
  type TemporalPropertyName,
} from "./normalizeIcalDateTime";
import type {
  NormalizedIcalDateTime,
  NormalizedIcalIssue,
  NormalizedIcalProperty,
} from "./icalParseTypes";

export interface CalendarPromotions {
  prodid: string | null;
  version: string | null;
  calscale: string | null;
  method: string | null;
  issues: NormalizedIcalIssue[];
}

export interface EventPromotions {
  uid: string | null;
  sequence: number | null;
  status: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  dtstart: NormalizedIcalDateTime | null;
  dtend: NormalizedIcalDateTime | null;
  recurrenceId: NormalizedIcalDateTime | null;
  dtstamp: NormalizedIcalDateTime | null;
  created: NormalizedIcalDateTime | null;
  lastModified: NormalizedIcalDateTime | null;
  issues: NormalizedIcalIssue[];
}

function propsNamed(
  properties: readonly NormalizedIcalProperty[],
  name: string,
): NormalizedIcalProperty[] {
  return properties.filter((p) => p.name === name);
}

function pushIssue(
  issues: NormalizedIcalIssue[],
  code: IcalParseIssueCode,
  meta: Omit<NormalizedIcalIssue, "code"> = {},
): void {
  issues.push({ code, ...meta });
}

function promoteSingularText(
  properties: readonly NormalizedIcalProperty[],
  name: "SUMMARY" | "DESCRIPTION" | "LOCATION",
  duplicateCode: IcalParseIssueCode,
  issues: NormalizedIcalIssue[],
  scope: { componentName?: string; componentIndex?: number; eventIndex?: number },
): string | null {
  const matches = propsNamed(properties, name);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    pushIssue(issues, duplicateCode, {
      ...scope,
      propertyName: name,
      propertyIndex: matches[0]!.propertyIndex,
    });
    return null;
  }
  const decoded = decodeIcalTextValue(matches[0]!.value);
  if (decoded === null) {
    pushIssue(issues, "INVALID_TEXT_ESCAPE", {
      ...scope,
      propertyName: name,
      propertyIndex: matches[0]!.propertyIndex,
    });
    return null;
  }
  return decoded;
}

function promoteSingularRaw(
  properties: readonly NormalizedIcalProperty[],
  name: string,
  duplicateCode: IcalParseIssueCode,
  issues: NormalizedIcalIssue[],
  scope: { componentName?: string; componentIndex?: number; eventIndex?: number },
): string | null {
  const matches = propsNamed(properties, name);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    pushIssue(issues, duplicateCode, {
      ...scope,
      propertyName: name,
      propertyIndex: matches[0]!.propertyIndex,
    });
    return null;
  }
  return matches[0]!.value;
}

function promoteSingularTemporal(
  properties: readonly NormalizedIcalProperty[],
  name: TemporalPropertyName,
  duplicateCode: IcalParseIssueCode,
  issues: NormalizedIcalIssue[],
  scope: { componentName?: string; componentIndex?: number; eventIndex?: number },
): NormalizedIcalDateTime | null {
  const matches = propsNamed(properties, name);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    pushIssue(issues, duplicateCode, {
      ...scope,
      propertyName: name,
      propertyIndex: matches[0]!.propertyIndex,
    });
    return null;
  }
  const result = normalizeIcalDateTime(name, matches[0]!);
  if (!result.ok) {
    pushIssue(issues, result.issue, {
      ...scope,
      propertyName: name,
      propertyIndex: matches[0]!.propertyIndex,
    });
    return null;
  }
  return result.value;
}

function promoteSequence(
  properties: readonly NormalizedIcalProperty[],
  issues: NormalizedIcalIssue[],
  scope: { componentName?: string; componentIndex?: number; eventIndex?: number },
): number | null {
  const matches = propsNamed(properties, "SEQUENCE");
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    pushIssue(issues, "DUPLICATE_SEQUENCE_PROPERTY", {
      ...scope,
      propertyName: "SEQUENCE",
      propertyIndex: matches[0]!.propertyIndex,
    });
    return null;
  }
  const raw = matches[0]!.value;
  if (!/^\d+$/.test(raw)) {
    pushIssue(issues, "INVALID_SEQUENCE", {
      ...scope,
      propertyName: "SEQUENCE",
      propertyIndex: matches[0]!.propertyIndex,
    });
    return null;
  }
  const num = Number(raw);
  if (!Number.isSafeInteger(num)) {
    pushIssue(issues, "INVALID_SEQUENCE", {
      ...scope,
      propertyName: "SEQUENCE",
      propertyIndex: matches[0]!.propertyIndex,
    });
    return null;
  }
  return num;
}

export function promoteCalendarFields(
  properties: readonly NormalizedIcalProperty[],
): CalendarPromotions {
  const issues: NormalizedIcalIssue[] = [];
  const scope = { componentName: "VCALENDAR" };

  const prodid = promoteSingularRaw(
    properties,
    "PRODID",
    "DUPLICATE_PRODID_PROPERTY",
    issues,
    scope,
  );
  const version = promoteSingularRaw(
    properties,
    "VERSION",
    "DUPLICATE_VERSION_PROPERTY",
    issues,
    scope,
  );
  const calscale = promoteSingularRaw(
    properties,
    "CALSCALE",
    "DUPLICATE_CALSCALE_PROPERTY",
    issues,
    scope,
  );
  const method = promoteSingularRaw(
    properties,
    "METHOD",
    "DUPLICATE_METHOD_PROPERTY",
    issues,
    scope,
  );

  if (prodid === null && propsNamed(properties, "PRODID").length === 0) {
    pushIssue(issues, "MISSING_PRODID", scope);
  }
  if (version === null && propsNamed(properties, "VERSION").length === 0) {
    pushIssue(issues, "MISSING_VERSION", scope);
  } else if (version !== null && version !== "2.0") {
    pushIssue(issues, "UNSUPPORTED_VERSION", {
      ...scope,
      propertyName: "VERSION",
    });
  }

  return { prodid, version, calscale, method, issues };
}

export function promoteEventFields(
  properties: readonly NormalizedIcalProperty[],
  meta: { componentIndex: number; eventIndex: number },
): EventPromotions {
  const issues: NormalizedIcalIssue[] = [];
  const scope = {
    componentName: "VEVENT" as const,
    componentIndex: meta.componentIndex,
    eventIndex: meta.eventIndex,
  };

  const uid = promoteSingularRaw(properties, "UID", "DUPLICATE_UID_PROPERTY", issues, scope);
  const sequence = promoteSequence(properties, issues, scope);
  const statusRaw = promoteSingularRaw(
    properties,
    "STATUS",
    "DUPLICATE_STATUS_PROPERTY",
    issues,
    scope,
  );
  const status = statusRaw === null ? null : statusRaw.toUpperCase();

  const summary = promoteSingularText(
    properties,
    "SUMMARY",
    "DUPLICATE_SUMMARY_PROPERTY",
    issues,
    scope,
  );
  const description = promoteSingularText(
    properties,
    "DESCRIPTION",
    "DUPLICATE_DESCRIPTION_PROPERTY",
    issues,
    scope,
  );
  const location = promoteSingularText(
    properties,
    "LOCATION",
    "DUPLICATE_LOCATION_PROPERTY",
    issues,
    scope,
  );

  const dtstart = promoteSingularTemporal(
    properties,
    "DTSTART",
    "DUPLICATE_DTSTART_PROPERTY",
    issues,
    scope,
  );
  const dtend = promoteSingularTemporal(
    properties,
    "DTEND",
    "DUPLICATE_DTEND_PROPERTY",
    issues,
    scope,
  );
  const recurrenceId = promoteSingularTemporal(
    properties,
    "RECURRENCE-ID",
    "DUPLICATE_RECURRENCE_ID_PROPERTY",
    issues,
    scope,
  );
  const dtstamp = promoteSingularTemporal(
    properties,
    "DTSTAMP",
    "DUPLICATE_DTSTAMP_PROPERTY",
    issues,
    scope,
  );
  const created = promoteSingularTemporal(
    properties,
    "CREATED",
    "DUPLICATE_CREATED_PROPERTY",
    issues,
    scope,
  );
  const lastModified = promoteSingularTemporal(
    properties,
    "LAST-MODIFIED",
    "DUPLICATE_LAST_MODIFIED_PROPERTY",
    issues,
    scope,
  );

  if (propsNamed(properties, "DURATION").length > 1) {
    pushIssue(issues, "DUPLICATE_DURATION_PROPERTY", {
      ...scope,
      propertyName: "DURATION",
    });
  }
  if (propsNamed(properties, "RRULE").length > 1) {
    pushIssue(issues, "MULTIPLE_RRULE_PROPERTIES", {
      ...scope,
      propertyName: "RRULE",
    });
  }

  return {
    uid,
    sequence,
    status,
    summary,
    description,
    location,
    dtstart,
    dtend,
    recurrenceId,
    dtstamp,
    created,
    lastModified,
    issues,
  };
}
