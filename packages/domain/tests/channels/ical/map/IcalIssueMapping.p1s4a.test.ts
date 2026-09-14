import { describe, expect, it } from "vitest";
import { ICAL_PARSE_ISSUE_CODES } from "../../../../src/channels";
import {
  ICAL_ISSUE_OWNERSHIP_V1,
  assertIssueMappingComplete,
  encodeEqualityBitfield,
  emptyEqualityFlags,
  applyParserIssuesToEqualityFlags,
} from "../../../../src/channels/providers/ical/map/icalEqualityFlags";

describe("IcalIssueMapping P1-S4a", () => {
  it("covers every current parse issue code exactly", () => {
    assertIssueMappingComplete();
    expect(Object.keys(ICAL_ISSUE_OWNERSHIP_V1).sort()).toEqual(
      [...ICAL_PARSE_ISSUE_CODES].sort(),
    );
    expect(ICAL_PARSE_ISSUE_CODES).toHaveLength(34);
  });

  it("encodes equality bits in the approved positions", () => {
    expect(
      encodeEqualityBitfield({
        identityInvalid: true,
        duplicateUidProperty: false,
        timeInvalid: false,
        recurrenceUnsupported: false,
        multipleRrule: false,
        unsupportedFeature: false,
        recurrenceIdentityHashed: false,
      }),
    ).toBe(1 << 0);
    expect(
      encodeEqualityBitfield({
        identityInvalid: false,
        duplicateUidProperty: true,
        timeInvalid: false,
        recurrenceUnsupported: false,
        multipleRrule: false,
        unsupportedFeature: false,
        recurrenceIdentityHashed: false,
      }),
    ).toBe(1 << 1);
    expect(
      encodeEqualityBitfield({
        identityInvalid: false,
        duplicateUidProperty: false,
        timeInvalid: true,
        recurrenceUnsupported: false,
        multipleRrule: false,
        unsupportedFeature: false,
        recurrenceIdentityHashed: false,
      }),
    ).toBe(1 << 2);
    expect(
      encodeEqualityBitfield({
        identityInvalid: false,
        duplicateUidProperty: false,
        timeInvalid: false,
        recurrenceUnsupported: true,
        multipleRrule: false,
        unsupportedFeature: false,
        recurrenceIdentityHashed: false,
      }),
    ).toBe(1 << 3);
    expect(
      encodeEqualityBitfield({
        identityInvalid: false,
        duplicateUidProperty: false,
        timeInvalid: false,
        recurrenceUnsupported: false,
        multipleRrule: true,
        unsupportedFeature: false,
        recurrenceIdentityHashed: false,
      }),
    ).toBe(1 << 4);
    expect(
      encodeEqualityBitfield({
        identityInvalid: false,
        duplicateUidProperty: false,
        timeInvalid: false,
        recurrenceUnsupported: false,
        multipleRrule: false,
        unsupportedFeature: true,
        recurrenceIdentityHashed: false,
      }),
    ).toBe(1 << 5);
    expect(
      encodeEqualityBitfield({
        identityInvalid: false,
        duplicateUidProperty: false,
        timeInvalid: false,
        recurrenceUnsupported: false,
        multipleRrule: false,
        unsupportedFeature: false,
        recurrenceIdentityHashed: true,
      }),
    ).toBe(1 << 6);
  });

  it("does not let INVALID_TEXT_ESCAPE affect equality bits", () => {
    const flags = applyParserIssuesToEqualityFlags(
      [{ code: "INVALID_TEXT_ESCAPE", propertyName: "SUMMARY" }],
      emptyEqualityFlags(),
    );
    expect(encodeEqualityBitfield(flags)).toBe(0);
  });

  it("maps DUPLICATE_UID_PROPERTY to identity flags", () => {
    const flags = applyParserIssuesToEqualityFlags(
      [{ code: "DUPLICATE_UID_PROPERTY" }],
      emptyEqualityFlags(),
    );
    expect(flags.identityInvalid).toBe(true);
    expect(flags.duplicateUidProperty).toBe(true);
  });

  it("does not set timeInvalid for DUPLICATE_VALUE_PARAMETER on non-temporal property", () => {
    const flags = applyParserIssuesToEqualityFlags(
      [{ code: "DUPLICATE_VALUE_PARAMETER", propertyName: "SUMMARY" }],
      emptyEqualityFlags(),
    );
    expect(flags.timeInvalid).toBe(false);
    expect(encodeEqualityBitfield(flags)).toBe(0);
  });
});
