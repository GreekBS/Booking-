import type { IcalParseIssueCode } from "./icalParseIssueCodes";

export interface NormalizedIcalParameter {
  readonly name: string;
  readonly values: readonly string[];
}

export interface NormalizedIcalProperty {
  readonly name: string;
  readonly parameters: readonly NormalizedIcalParameter[];
  readonly value: string;
  readonly propertyIndex: number;
}

export interface NormalizedIcalIssue {
  readonly code: IcalParseIssueCode;
  readonly componentName?: string;
  readonly propertyName?: string;
  readonly propertyIndex?: number;
  readonly componentIndex?: number;
  readonly eventIndex?: number;
}

export type NormalizedIcalDateTimeKind =
  | "date"
  | "dateTimeUtc"
  | "dateTimeFloating"
  | "dateTimeWithTzId";

export interface NormalizedIcalDateTime {
  readonly kind: NormalizedIcalDateTimeKind;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly second?: number;
  readonly tzId?: string;
  readonly value: string;
}

export interface NormalizedGenericIcalComponent {
  readonly name: string;
  readonly componentIndex: number;
  readonly properties: readonly NormalizedIcalProperty[];
  readonly components: readonly NormalizedIcalComponent[];
  readonly issues: readonly NormalizedIcalIssue[];
}

export interface NormalizedIcalEvent {
  readonly name: "VEVENT";
  readonly componentIndex: number;
  readonly eventIndex: number;
  readonly properties: readonly NormalizedIcalProperty[];
  readonly components: readonly NormalizedIcalComponent[];
  readonly issues: readonly NormalizedIcalIssue[];
  readonly uid: string | null;
  readonly sequence: number | null;
  readonly status: string | null;
  readonly summary: string | null;
  readonly description: string | null;
  readonly location: string | null;
  readonly dtstart: NormalizedIcalDateTime | null;
  readonly dtend: NormalizedIcalDateTime | null;
  readonly recurrenceId: NormalizedIcalDateTime | null;
  readonly dtstamp: NormalizedIcalDateTime | null;
  readonly created: NormalizedIcalDateTime | null;
  readonly lastModified: NormalizedIcalDateTime | null;
}

export type NormalizedIcalComponent =
  | NormalizedIcalEvent
  | NormalizedGenericIcalComponent;

export interface NormalizedIcalCalendar {
  readonly rawByteLength: number;
  readonly prodid: string | null;
  readonly version: string | null;
  readonly calscale: string | null;
  readonly method: string | null;
  readonly properties: readonly NormalizedIcalProperty[];
  readonly components: readonly NormalizedIcalComponent[];
  readonly events: readonly NormalizedIcalEvent[];
  readonly issues: readonly NormalizedIcalIssue[];
}
