import { GuestCount } from "../../shared/value-objects/GuestCount";
import { StayPeriod } from "../../shared/value-objects/StayPeriod";
import { classifyImportStayTemporalClass } from "../ImportStayTemporalClass";
import type { CsvImportDateFormat } from "./constants";
import { parseCsvImportDate } from "./parseDate";
import { parseCsvImportPrice } from "./parsePrice";
import type {
  CsvImportCanonicalField,
  CsvImportCanonicalRow,
  CsvImportIssue,
  CsvImportUnitResolution,
} from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidateCsvImportRowInput {
  rowNumber: number;
  /** Values keyed by canonical field from mapping. */
  values: Partial<Record<CsvImportCanonicalField, string>>;
  /** Original header → raw cell. */
  raw: Record<string, string>;
  dateFormat?: CsvImportDateFormat;
  propertyLocalToday?: string;
  unitResolution?: CsvImportUnitResolution | null;
  /** When true, emit UNIT_UNRESOLVED if resolution missing/failed. */
  requireUnitResolution?: boolean;
}

export function validateCsvImportRow(
  input: ValidateCsvImportRowInput,
): CsvImportCanonicalRow {
  const errors: CsvImportIssue[] = [];
  const warnings: CsvImportIssue[] = [];
  const v = input.values;

  const externalReference = emptyToNull(v.externalReference);
  const unitRef = emptyToNull(v.unitRef);
  const guestName = emptyToNull(v.guestName);
  const guestEmail = emptyToNull(v.guestEmail);
  const guestPhone = emptyToNull(v.guestPhone);
  const guestCountRaw = emptyToNull(v.guestCount);
  const channelSource = emptyToNull(v.channelSource);
  const notes = emptyToNull(v.notes);

  if (!externalReference) {
    errors.push(rowError(input.rowNumber, "REQUIRED_EXTERNAL_REFERENCE", "externalReference", "External reservation reference is required"));
  }
  if (!unitRef) {
    errors.push(rowError(input.rowNumber, "REQUIRED_UNIT_REF", "unitRef", "Unit reference is required"));
  }
  if (!guestName) {
    errors.push(rowError(input.rowNumber, "REQUIRED_GUEST_NAME", "guestName", "Guest name is required"));
  }
  if (!guestEmail) {
    errors.push(rowError(input.rowNumber, "REQUIRED_GUEST_EMAIL", "guestEmail", "Guest email is required"));
  } else if (!EMAIL_RE.test(guestEmail)) {
    errors.push(rowError(input.rowNumber, "INVALID_GUEST_EMAIL", "guestEmail", `Invalid guest email: ${guestEmail}`));
  }

  let checkIn: string | null = null;
  let checkOut: string | null = null;
  let temporalClass = null as CsvImportCanonicalRow["temporalClass"];

  const checkInRaw = emptyToNull(v.checkIn);
  const checkOutRaw = emptyToNull(v.checkOut);
  if (!checkInRaw) {
    errors.push(rowError(input.rowNumber, "REQUIRED_CHECK_IN", "checkIn", "Check-in date is required"));
  } else {
    const parsed = parseCsvImportDate(checkInRaw, input.dateFormat);
    if (!parsed.ok) {
      errors.push(rowError(input.rowNumber, parsed.code, "checkIn", parsed.message));
    } else {
      checkIn = parsed.iso;
    }
  }
  if (!checkOutRaw) {
    errors.push(rowError(input.rowNumber, "REQUIRED_CHECK_OUT", "checkOut", "Check-out date is required"));
  } else {
    const parsed = parseCsvImportDate(checkOutRaw, input.dateFormat);
    if (!parsed.ok) {
      errors.push(rowError(input.rowNumber, parsed.code, "checkOut", parsed.message));
    } else {
      checkOut = parsed.iso;
    }
  }

  if (checkIn && checkOut) {
    try {
      StayPeriod.create(checkIn, checkOut);
      if (input.propertyLocalToday) {
        temporalClass = classifyImportStayTemporalClass(
          checkIn,
          checkOut,
          input.propertyLocalToday,
        );
      }
    } catch {
      errors.push(
        rowError(
          input.rowNumber,
          "INVALID_STAY_PERIOD",
          "checkOut",
          "checkOut must be after checkIn",
        ),
      );
      checkOut = checkOut; // keep parsed values for diagnostics
    }
  }

  let guestCount: number | null = null;
  if (!guestCountRaw) {
    errors.push(rowError(input.rowNumber, "REQUIRED_GUEST_COUNT", "guestCount", "Guest count is required"));
  } else {
    const n = Number(guestCountRaw.replace(",", "."));
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      errors.push(rowError(input.rowNumber, "INVALID_GUEST_COUNT", "guestCount", `Invalid guest count: ${guestCountRaw}`));
    } else {
      try {
        guestCount = GuestCount.create(n).value;
      } catch {
        errors.push(rowError(input.rowNumber, "INVALID_GUEST_COUNT", "guestCount", "Guest count must be a positive integer"));
      }
    }
  }

  const price = parseCsvImportPrice(v.totalAmount, v.currency);
  let totalAmount: string | null = null;
  let currency: string | null = null;
  if (price.status === "present") {
    totalAmount = price.amount;
    currency = price.currency;
  } else if (price.status === "invalid") {
    errors.push(
      rowError(input.rowNumber, "INVALID_PRICE", "totalAmount", price.reason, {
        raw: price.raw,
      }),
    );
  }

  let unitId: string | null = null;
  let propertyId: string | null = null;
  if (unitRef && input.requireUnitResolution) {
    const res = input.unitResolution;
    if (!res) {
      errors.push(
        rowError(input.rowNumber, "UNIT_UNRESOLVED", "unitRef", `Unit was not resolved: ${unitRef}`),
      );
    } else if (res.status === "resolved") {
      unitId = res.unitId;
      propertyId = res.propertyId;
    } else if (res.status === "not_found") {
      errors.push(
        rowError(input.rowNumber, "UNIT_NOT_FOUND", "unitRef", `Unknown unit reference: ${unitRef}`),
      );
    } else {
      errors.push(
        rowError(
          input.rowNumber,
          "UNIT_AMBIGUOUS",
          "unitRef",
          `Ambiguous unit reference: ${unitRef}`,
          { candidateIds: res.candidateIds },
        ),
      );
    }
  } else if (unitRef && input.unitResolution?.status === "resolved") {
    unitId = input.unitResolution.unitId;
    propertyId = input.unitResolution.propertyId;
  } else if (unitRef && input.unitResolution?.status === "not_found") {
    errors.push(
      rowError(input.rowNumber, "UNIT_NOT_FOUND", "unitRef", `Unknown unit reference: ${unitRef}`),
    );
  } else if (unitRef && input.unitResolution?.status === "ambiguous") {
    errors.push(
      rowError(
        input.rowNumber,
        "UNIT_AMBIGUOUS",
        "unitRef",
        `Ambiguous unit reference: ${unitRef}`,
        { candidateIds: input.unitResolution.candidateIds },
      ),
    );
  }

  const structurallyImportable =
    errors.length === 0 &&
    externalReference != null &&
    unitRef != null &&
    guestName != null &&
    guestEmail != null &&
    checkIn != null &&
    checkOut != null &&
    guestCount != null &&
    (!input.requireUnitResolution || unitId != null);

  return {
    rowNumber: input.rowNumber,
    externalReference,
    unitRef,
    unitId,
    propertyId,
    guestName,
    guestEmail,
    guestPhone,
    checkIn,
    checkOut,
    guestCount,
    totalAmount,
    currency,
    channelSource,
    notes,
    price,
    temporalClass,
    raw: input.raw,
    errors,
    warnings,
    structurallyImportable,
  };
}

function emptyToNull(value: string | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function rowError(
  rowNumber: number,
  code: string,
  field: CsvImportCanonicalField | null,
  message: string,
  details?: Record<string, unknown>,
): CsvImportIssue {
  return {
    code,
    severity: "error",
    message,
    rowNumber,
    field,
    details,
  };
}
