import { DomainError } from "../../../../shared/errors/DomainError";
import type { IcalMapLimitKey } from "./icalMapLimits";

export type IcalMapErrorCode =
  | "ICAL_MAP_LIMIT_EXCEEDED"
  | "ICAL_MAP_IDENTITY_INVARIANT"
  | "ICAL_MAP_HASH_INVARIANT"
  | "ICAL_MAP_CURSOR_ENCODE_FAILED"
  | "ICAL_MAP_INTERNAL_ERROR";

/**
 * Fatal mapper invariant failures only.
 * Messages must never include UID, RID, identity keys, property values, or cursor payloads.
 */
export class IcalMapError extends DomainError {
  readonly limitKey?: IcalMapLimitKey;

  constructor(
    code: IcalMapErrorCode,
    message: string,
    meta: { limitKey?: IcalMapLimitKey } = {},
  ) {
    super(message, code);
    this.limitKey = meta.limitKey;
  }
}

export function isIcalMapError(error: unknown): error is IcalMapError {
  return error instanceof IcalMapError;
}

export function wrapIcalMapBoundaryError(error: unknown): never {
  if (error instanceof IcalMapError) {
    throw error;
  }
  throw new IcalMapError("ICAL_MAP_INTERNAL_ERROR", "Internal calendar map failure");
}
