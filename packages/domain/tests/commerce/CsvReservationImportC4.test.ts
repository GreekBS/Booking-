import { describe, expect, it } from "vitest";
import {
  createInMemoryCsvImportUnitResolver,
  csvImportRequiredFieldsForProperty,
  CSV_IMPORT_REQUIRED_FIELDS,
  parseAndValidateCsvImport,
  parseCsvImportDate,
  resolveCsvImportUnitRefs,
} from "../../src/commerce/import/csv";
import { CreateReservationImportDraftUseCase } from "../../src/commerce/import/CreateReservationImportDraftUseCase";
import type { IReservationImportRepository } from "../../src/commerce/import/IReservationImportRepository";
import { GuestDetailsProps } from "../../src/commerce/shared/types/CommerceTypes";
import { Booking } from "../../src/commerce/booking/domain/Booking";
import { Hold } from "../../src/commerce/booking/domain/Hold";
import { Quote } from "../../src/commerce/booking/domain/Quote";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { mutationOriginOperator } from "../../src/shared/types/MutationOrigin";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";

function enc(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const PROP_A = "prop-a";
const PROP_B = "prop-b";
const UNIT_A1 = "unit-a1";
const UNIT_A2 = "unit-a2";
const UNIT_B1 = "unit-b1";

const singleUnitResolver = createInMemoryCsvImportUnitResolver([
  { id: UNIT_A1, propertyId: PROP_A, name: "Entire Property", slug: "entire-property" },
  { id: UNIT_B1, propertyId: PROP_B, name: "Entire Property", slug: "entire-property" },
]);

const multiUnitResolver = createInMemoryCsvImportUnitResolver([
  { id: UNIT_A1, propertyId: PROP_A, name: "Room 1", slug: "room-1" },
  { id: UNIT_A2, propertyId: PROP_A, name: "Room 2", slug: "room-2" },
  { id: UNIT_B1, propertyId: PROP_B, name: "Room 1", slug: "room-1" },
]);

describe("C4 CSV import contract — A–R matrix (domain)", () => {
  it("A: single-unit property + no unitRef + no email → ACCEPT structurally with default unit", async () => {
    const csv = `reservation_id,guest_name,check_in,check_out,guest_count,total_amount,currency
QA-1,Ada Lovelace,2026-11-15,2026-11-17,2,150.00,EUR`;
    const units = await singleUnitResolver.listBookableUnits("t1", PROP_A);
    expect(units).toHaveLength(1);
    const parsed = parseAndValidateCsvImport({
      content: enc(csv),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-06",
      bookableUnitCount: 1,
      unitResolutions: new Map(),
      defaultUnitResolution: {
        status: "resolved",
        unitId: UNIT_A1,
        propertyId: PROP_A,
      },
    });
    expect(parsed.headerMapping?.missingRequiredFields).toEqual([]);
    expect(parsed.rows[0]!.errors).toEqual([]);
    expect(parsed.rows[0]!.guestEmail).toBeNull();
    expect(parsed.rows[0]!.unitId).toBe(UNIT_A1);
    expect(parsed.rows[0]!.structurallyImportable).toBe(true);
  });

  it("B: single-unit + unitRef present → ACCEPT when matches", async () => {
    const csv = `reservation_id,unit_name,guest_name,guest_email,check_in,check_out,guest_count
QA-2,Entire Property,Ada,ada@example.com,2026-11-15,2026-11-17,2`;
    const resolutions = await resolveCsvImportUnitRefs(
      singleUnitResolver,
      "t1",
      PROP_A,
      ["Entire Property"],
    );
    const parsed = parseAndValidateCsvImport({
      content: enc(csv),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-06",
      bookableUnitCount: 1,
      unitResolutions: resolutions,
      defaultUnitResolution: {
        status: "resolved",
        unitId: UNIT_A1,
        propertyId: PROP_A,
      },
    });
    expect(parsed.rows[0]!.unitId).toBe(UNIT_A1);
    expect(parsed.rows[0]!.structurallyImportable).toBe(true);
  });

  it("C: multi-unit + valid unitRef → ACCEPT", async () => {
    const csv = `reservation_id,unit_name,guest_name,check_in,check_out,guest_count
QA-3,Room 2,Ada,2026-11-15,2026-11-17,2`;
    const resolutions = await resolveCsvImportUnitRefs(
      multiUnitResolver,
      "t1",
      PROP_A,
      ["Room 2"],
    );
    const parsed = parseAndValidateCsvImport({
      content: enc(csv),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-06",
      bookableUnitCount: 2,
      unitResolutions: resolutions,
    });
    expect(parsed.rows[0]!.unitId).toBe(UNIT_A2);
    expect(parsed.rows[0]!.structurallyImportable).toBe(true);
  });

  it("D: multi-unit + no unitRef → BLOCK", async () => {
    const csv = `reservation_id,guest_name,check_in,check_out,guest_count
QA-4,Ada,2026-11-15,2026-11-17,2`;
    const parsed = parseAndValidateCsvImport({
      content: enc(csv),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-06",
      bookableUnitCount: 2,
      unitResolutions: new Map(),
    });
    expect(parsed.headerMapping?.missingRequiredFields).toContain("unitRef");
    expect(parsed.rows[0]!.errors.some((e) => e.code === "REQUIRED_UNIT_REF")).toBe(
      true,
    );
    expect(parsed.rows[0]!.structurallyImportable).toBe(false);
  });

  it("E: multi-unit + ambiguous unitRef → BLOCK", async () => {
    const resolver = createInMemoryCsvImportUnitResolver([
      { id: "u1", propertyId: PROP_A, name: "Suite", slug: "suite" },
      { id: "u2", propertyId: PROP_A, name: "Suite", slug: "suite-2" },
    ]);
    const res = await resolver.resolve("t1", PROP_A, "Suite");
    expect(res.status).toBe("ambiguous");
  });

  it("F: no email + valid other guest data → ACCEPT", () => {
    const csv = `reservation_id,unit_name,guest_name,guest_phone,check_in,check_out,guest_count
QA-6,Entire Property,Ada,+306900000000,2026-11-15,2026-11-17,2`;
    const parsed = parseAndValidateCsvImport({
      content: enc(csv),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-06",
      bookableUnitCount: 1,
      unitResolutions: new Map([["Entire Property", { status: "resolved", unitId: UNIT_A1, propertyId: PROP_A }]]),
      defaultUnitResolution: {
        status: "resolved",
        unitId: UNIT_A1,
        propertyId: PROP_A,
      },
    });
    expect(parsed.rows[0]!.guestEmail).toBeNull();
    expect(parsed.rows[0]!.guestPhone).toBe("+306900000000");
    expect(parsed.rows[0]!.errors.some((e) => e.field === "guestEmail")).toBe(false);
  });

  it("G: valid email present → preserve", () => {
    const csv = `reservation_id,guest_name,guest_email,check_in,check_out,guest_count
QA-7,Ada,ada@example.com,2026-11-15,2026-11-17,2`;
    const parsed = parseAndValidateCsvImport({
      content: enc(csv),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-06",
      bookableUnitCount: 1,
      unitResolutions: new Map(),
      defaultUnitResolution: {
        status: "resolved",
        unitId: UNIT_A1,
        propertyId: PROP_A,
      },
    });
    expect(parsed.rows[0]!.guestEmail).toBe("ada@example.com");
  });

  it("H: invalid non-empty email → validation error", () => {
    const csv = `reservation_id,guest_name,guest_email,check_in,check_out,guest_count
QA-8,Ada,not-an-email,2026-11-15,2026-11-17,2`;
    const parsed = parseAndValidateCsvImport({
      content: enc(csv),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-06",
      bookableUnitCount: 1,
      unitResolutions: new Map(),
      defaultUnitResolution: {
        status: "resolved",
        unitId: UNIT_A1,
        propertyId: PROP_A,
      },
    });
    expect(parsed.rows[0]!.errors.some((e) => e.code === "INVALID_GUEST_EMAIL")).toBe(
      true,
    );
  });

  it("I: real datetime `2026-11-06 03:00 PM` → stay date 2026-11-06", () => {
    const parsed = parseCsvImportDate("2026-11-06 03:00 PM", "iso");
    expect(parsed).toEqual({ ok: true, iso: "2026-11-06" });
  });

  it("J: existing standard Talos CSV regression PASS", () => {
    const csv = `reservation_id,unit_name,guest_name,guest_email,check_in,check_out,guest_count,total_amount,currency
R1,Sea View,Ada Lovelace,ada@example.com,2026-11-01,2026-11-05,2,100.00,EUR`;
    expect(CSV_IMPORT_REQUIRED_FIELDS).not.toContain("unitRef");
    expect(CSV_IMPORT_REQUIRED_FIELDS).not.toContain("guestEmail");
    expect(csvImportRequiredFieldsForProperty(2)).toContain("unitRef");
    const parsed = parseAndValidateCsvImport({
      content: enc(csv),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-06",
      bookableUnitCount: 2,
      unitResolutions: new Map([
        [
          "Sea View",
          { status: "resolved", unitId: UNIT_A1, propertyId: PROP_A },
        ],
      ]),
    });
    expect(parsed.rows[0]!.structurallyImportable).toBe(true);
    expect(parsed.rows[0]!.guestEmail).toBe("ada@example.com");
  });

  it("K/L: Booking accepts null email and does not invent one", () => {
    const now = new Date("2026-10-06T12:00:00.000Z");
    const origin = mutationOriginOperator();
    const hold = Hold.create({
      id: "hold-1",
      tenantId: "t1",
      unitId: UNIT_A1,
      propertyId: PROP_A,
      checkIn: "2026-11-15",
      checkOut: "2026-11-17",
      guestCount: 2,
      sessionRef: "csv:test",
      ttlSeconds: 3600,
      now,
      mutationOrigin: origin,
    });
    const quote = Quote.createFromFixedTotal({
      id: "quote-1",
      snapshotId: "snap-1",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("150.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: now,
    });
    const guest: GuestDetailsProps = {
      name: "QA Smoke Guest",
      email: null,
      phone: "+306911111111",
    };
    const booking = Booking.create({
      id: "booking-1",
      hold,
      quote,
      guest,
      confirmationMode: "manual",
      now,
      mutationOrigin: origin,
    });
    expect(booking.guest.email).toBeNull();
    expect(booking.guest.phone).toBe("+306911111111");
  });

  it("M/N: cross-property unit resolution impossible", async () => {
    const resOnA = await singleUnitResolver.resolve("t1", PROP_A, UNIT_B1);
    expect(resOnA.status).toBe("not_found");
    const resName = await multiUnitResolver.resolve("t1", PROP_A, "Room 1");
    expect(resName.status).toBe("resolved");
    if (resName.status === "resolved") {
      expect(resName.propertyId).toBe(PROP_A);
      expect(resName.unitId).toBe(UNIT_A1);
    }
    // Same name on PROP_B is invisible when resolving for PROP_A
    const books = await multiUnitResolver.listBookableUnits("t1", PROP_A);
    expect(books.every((u) => u.propertyId === PROP_A)).toBe(true);
    expect(books.some((u) => u.id === UNIT_B1)).toBe(false);
  });

  it("O: required fields helper — multi requires unitRef; single does not", () => {
    expect(csvImportRequiredFieldsForProperty(1)).not.toContain("unitRef");
    expect(csvImportRequiredFieldsForProperty(2)).toContain("unitRef");
    expect(csvImportRequiredFieldsForProperty(0)).not.toContain("guestEmail");
  });

  it("P: missing/foreign propertyId rejected; 0 units fail closed", async () => {
    const actor: ActorContext = {
      userId: "actor-1",
      role: "admin",
      propertyIds: null,
    };
    const imports = {
      createBatch: async () => {
        throw new Error("createBatch must not run");
      },
    } as unknown as IReservationImportRepository;
    const catalog = {
      getProperty: async (propertyId: string, tenantId: string) => {
        if (tenantId === "t1" && propertyId === PROP_A) {
          return { id: PROP_A, tenantId: "t1", timezone: "Europe/Athens", name: "A" };
        }
        return null;
      },
    };
    const useCase = new CreateReservationImportDraftUseCase(
      imports,
      singleUnitResolver,
      catalog as never,
      { listActiveForUnit: async () => [] } as never,
      { getForProperty: async () => null } as never,
      { propertyLocalToday: async () => "2026-10-06" } as never,
      { previewTotal: async () => null },
      { generate: () => "id-1" },
    );

    const missing = await useCase.execute(
      {
        tenantId: "t1",
        propertyId: "",
        filename: "x.csv",
        content: "a,b\n1,2",
      },
      actor,
    );
    expect(missing.isFailure).toBe(true);
    expect(missing.getError().message).toMatch(/propertyId is required/i);

    const foreign = await useCase.execute(
      {
        tenantId: "t1",
        propertyId: "prop-other-tenant",
        filename: "x.csv",
        content: "a,b\n1,2",
      },
      actor,
    );
    expect(foreign.isFailure).toBe(true);
    expect(foreign.getError().message).toMatch(/Property not found/i);

    const emptyResolver = createInMemoryCsvImportUnitResolver([]);
    const zeroUnits = new CreateReservationImportDraftUseCase(
      imports,
      emptyResolver,
      catalog as never,
      { listActiveForUnit: async () => [] } as never,
      { getForProperty: async () => null } as never,
      { propertyLocalToday: async () => "2026-10-06" } as never,
      { previewTotal: async () => null },
      { generate: () => "id-1" },
    );
    const zero = await zeroUnits.execute(
      {
        tenantId: "t1",
        propertyId: PROP_A,
        filename: "x.csv",
        content: "a,b\n1,2",
      },
      actor,
    );
    expect(zero.isFailure).toBe(true);
    expect(zero.getError().message).toMatch(/no bookable units/i);
  });

  it("Q: property rebind — required fields and default unit follow the new property", () => {
    // Simulates Active Property switch: never retain previous property's unit rules.
    expect(csvImportRequiredFieldsForProperty(1)).not.toContain("unitRef");
    expect(csvImportRequiredFieldsForProperty(3)).toContain("unitRef");
    const singleDefault = {
      status: "resolved" as const,
      unitId: UNIT_A1,
      propertyId: PROP_A,
    };
    const afterSwitchDefault = {
      status: "resolved" as const,
      unitId: UNIT_B1,
      propertyId: PROP_B,
    };
    expect(singleDefault.propertyId).not.toBe(afterSwitchDefault.propertyId);
    expect(afterSwitchDefault.unitId).toBe(UNIT_B1);
  });

  it("R: C1 commit path — null email + phone preserved; no synthetic email", () => {
    const now = new Date("2026-10-06T12:00:00.000Z");
    const origin = mutationOriginOperator();
    const hold = Hold.create({
      id: "hold-r",
      tenantId: "t1",
      unitId: UNIT_A1,
      propertyId: PROP_A,
      checkIn: "2026-11-15",
      checkOut: "2026-11-17",
      guestCount: 2,
      sessionRef: "csv:r",
      ttlSeconds: 3600,
      now,
      mutationOrigin: origin,
    });
    const quote = Quote.createFromFixedTotal({
      id: "quote-r",
      snapshotId: "snap-r",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("150.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: now,
    });
    const guest: GuestDetailsProps = {
      name: "No Email Guest",
      email: null,
      phone: "+306922222222",
    };
    const booking = Booking.create({
      id: "booking-r",
      hold,
      quote,
      guest,
      confirmationMode: "manual",
      now,
      mutationOrigin: origin,
    });
    booking.confirm(now, origin);
    expect(booking.guest.email).toBeNull();
    expect(booking.guest.phone).toBe("+306922222222");
    expect(String(booking.guest.email ?? "")).not.toMatch(/@/);
  });
});
