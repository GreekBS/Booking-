import { DomainError } from "../../../../shared/errors/DomainError";
import type { IcalParseLimitKey } from "./icalParseLimits";

export type IcalParseErrorCode =
  | "ICAL_PARSE_EMPTY_INPUT"
  | "ICAL_PARSE_INVALID_UTF8"
  | "ICAL_PARSE_NUL_REJECTED"
  | "ICAL_PARSE_BAD_NEWLINE"
  | "ICAL_PARSE_BAD_BOM"
  | "ICAL_PARSE_CONTROL_CHARACTER"
  | "ICAL_PARSE_MALFORMED_FOLDING"
  | "ICAL_PARSE_MALFORMED_PROPERTY"
  | "ICAL_PARSE_MALFORMED_PARAMETER"
  | "ICAL_PARSE_MALFORMED_BEGIN_END"
  | "ICAL_PARSE_MISSING_VCALENDAR"
  | "ICAL_PARSE_UNBALANCED_COMPONENT"
  | "ICAL_PARSE_MULTIPLE_ROOTS"
  | "ICAL_PARSE_NESTED_VCALENDAR"
  | "ICAL_PARSE_NESTED_VEVENT"
  | "ICAL_PARSE_VEVENT_NOT_ROOT_CHILD"
  | "ICAL_PARSE_VALARM_NESTED"
  | "ICAL_PARSE_TRAILING_CONTENT"
  | "ICAL_PARSE_LIMIT_EXCEEDED"
  | "ICAL_PARSE_INTERNAL_ERROR";

export class IcalParseError extends DomainError {
  readonly lineNumber?: number;
  readonly byteLength?: number;
  readonly limitKey?: IcalParseLimitKey;

  constructor(
    code: IcalParseErrorCode,
    message: string,
    meta: {
      lineNumber?: number;
      byteLength?: number;
      limitKey?: IcalParseLimitKey;
    } = {},
  ) {
    super(message, code);
    this.lineNumber = meta.lineNumber;
    this.byteLength = meta.byteLength;
    this.limitKey = meta.limitKey;
  }
}

export function isIcalParseError(error: unknown): error is IcalParseError {
  return error instanceof IcalParseError;
}

export function wrapIcalParseBoundaryError(error: unknown): never {
  if (error instanceof IcalParseError) {
    throw error;
  }
  throw new IcalParseError(
    "ICAL_PARSE_INTERNAL_ERROR",
    "Internal calendar parse failure",
  );
}
