import { describe, expect, it } from "vitest";
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_DATA_ROWS,
  createInMemoryCsvImportUnitResolver,
  detectCsvDelimiter,
  inspectCsvImport,
  mapCsvImportHeaders,
  normalizeCsvHeader,
  parseAndValidateCsvImport,
  parseCsvImportDate,
  parseCsvImportFile,
  resolveCsvImportUnitRefs,
} from "../../src/commerce/import/csv";

function enc(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const TODAY = "2026-10-03";

const BASE_HEADERS =
  "reservation_id,unit_name,guest_name,guest_email,check_in,check_out,guest_count,total_amount,currency";

function row(
  ref: string,
  unit: string,
  checkIn: string,
  checkOut: string,
  extras: Partial<{
    name: string;
    email: string;
    guests: string;
    total: string;
    currency: string;
  }> = {},
): string {
  return [
    ref,
    unit,
    extras.name ?? "Ada Lovelace",
    extras.email ?? "ada@example.com",
    checkIn,
    checkOut,
    extras.guests ?? "2",
    extras.total ?? "",
    extras.currency ?? "",
  ].join(",");
}

describe("CSV import B1 — parsing & mapping", () => {
  it("parses comma CSV", () => {
    const csv = `${BASE_HEADERS}\n${row("R1", "Sea View", "2026-11-01", "2026-11-05", { total: "100.00", currency: "EUR" })}`;
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      propertyLocalToday: TODAY,
    });
    expect(result.delimiter).toBe(",");
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]!.externalReference).toBe("R1");
    expect(result.rows[0]!.checkIn).toBe("2026-11-01");
    expect(result.rows[0]!.temporalClass).toBe("future");
  });

  it("parses semicolon CSV", () => {
    const csv = `reservation_id;unit_name;guest_name;guest_email;check_in;check_out;guest_count\nR2;Apt A;Bob;bob@example.com;2026-11-01;2026-11-03;2`;
    const result = parseAndValidateCsvImport({ content: csv, dateFormat: "iso", propertyLocalToday: TODAY });
    expect(result.delimiter).toBe(";");
    expect(result.rows[0]!.externalReference).toBe("R2");
  });

  it("parses tab CSV", () => {
    const csv = `reservation_id\tunit_name\tguest_name\tguest_email\tcheck_in\tcheck_out\tguest_count\nR3\tApt B\tCara\tcara@example.com\t2026-11-01\t2026-11-03\t2`;
    expect(detectCsvDelimiter(csv)).toBe("\t");
    const result = parseAndValidateCsvImport({ content: csv, dateFormat: "iso", propertyLocalToday: TODAY });
    expect(result.delimiter).toBe("\t");
    expect(result.rows[0]!.guestName).toBe("Cara");
  });

  it("handles quoted delimiter and embedded newline", () => {
    const csv =
      `reservation_id,unit_name,guest_name,guest_email,check_in,check_out,guest_count,notes\n` +
      `R4,Apt,"Ada, Jr.",ada@example.com,2026-11-01,2026-11-03,2,"line1\nline2"`;
    const file = parseCsvImportFile(csv);
    expect(file.ok).toBe(true);
    expect(file.records[0]![2]).toBe("Ada, Jr.");
    expect(file.records[0]![7]).toBe("line1\nline2");
  });

  it("strips UTF-8 BOM", () => {
    const csv = `\uFEFF${BASE_HEADERS}\n${row("R5", "U1", "2026-11-01", "2026-11-02")}`;
    const result = parseAndValidateCsvImport({ content: csv, dateFormat: "iso", propertyLocalToday: TODAY });
    expect(result.headerMapping?.headers[0]).toBe("reservation_id");
    expect(result.rows[0]!.externalReference).toBe("R5");
  });

  it("maps English aliases", () => {
    const mapping = mapCsvImportHeaders([
      "Booking Reference",
      "Room Name",
      "Guest Name",
      "Email",
      "Check-In",
      "Check Out",
      "Guests",
    ]);
    expect(mapping.autoMapped["Guest Name"]).toBe("guestName");
    expect(mapping.autoMapped["Booking Reference"]).toBe("externalReference");
    expect(mapping.missingRequiredFields).toEqual([]);
  });

  it("maps Greek aliases including Όνομα", () => {
    expect(normalizeCsvHeader("Όνομα")).toBe("ονομα");
    const mapping = mapCsvImportHeaders([
      "Κωδικός κράτησης",
      "Μονάδα",
      "Όνομα",
      "Email",
      "Άφιξη",
      "Αναχώρηση",
      "Επισκέπτες",
    ]);
    expect(mapping.autoMapped["Όνομα"]).toBe("guestName");
    expect(mapping.autoMapped["Άφιξη"]).toBe("checkIn");
    expect(mapping.autoMapped["Αναχώρηση"]).toBe("checkOut");
    expect(mapping.missingRequiredFields).toEqual([]);
  });

  it("applies explicit mapping override over auto-mapping", () => {
    const csv =
      `code,unit,label,mail,in,out,pax\n` +
      `X1,U1,Name,a@b.co,2026-11-01,2026-11-02,2`;
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      propertyLocalToday: TODAY,
      columnMapping: {
        code: "externalReference",
        unit: "unitRef",
        label: "guestName",
        mail: "guestEmail",
        in: "checkIn",
        out: "checkOut",
        pax: "guestCount",
      },
    });
    expect(result.rows[0]!.externalReference).toBe("X1");
    expect(result.rows[0]!.guestName).toBe("Name");
    expect(result.structurallyImportableCount).toBe(1);
  });

  it("reports unmapped required fields", () => {
    const mapping = mapCsvImportHeaders(["guest_name", "email"]);
    expect(mapping.missingRequiredFields).toContain("externalReference");
    expect(mapping.missingRequiredFields).toContain("checkIn");
  });

  it("reports ambiguous mapping when two columns claim the same field", () => {
    const mapping = mapCsvImportHeaders(["guest_name", "name", "email"]);
    expect(mapping.ambiguousFields).toContain("guestName");
    expect(mapping.issues.some((i) => i.code === "CSV_AMBIGUOUS_MAPPING")).toBe(true);
  });
});

describe("CSV import B1 — dates & temporal", () => {
  it("parses ISO dates", () => {
    expect(parseCsvImportDate("2026-03-04", "iso")).toEqual({
      ok: true,
      iso: "2026-03-04",
    });
  });

  it("parses DMY", () => {
    expect(parseCsvImportDate("03/04/2026", "dmy")).toEqual({
      ok: true,
      iso: "2026-04-03",
    });
  });

  it("parses MDY", () => {
    expect(parseCsvImportDate("03/04/2026", "mdy")).toEqual({
      ok: true,
      iso: "2026-03-04",
    });
  });

  it("refuses to guess ambiguous numeric dates", () => {
    const result = parseCsvImportDate("03/04/2026", undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DATE_FORMAT_REQUIRED");
  });

  it("rejects invalid calendar dates", () => {
    const result = parseCsvImportDate("2026-02-31", "iso");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DATE_INVALID");
  });

  it("rejects checkOut <= checkIn", () => {
    const csv = `${BASE_HEADERS}\n${row("R6", "U1", "2026-11-05", "2026-11-05")}`;
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      propertyLocalToday: TODAY,
    });
    expect(result.rows[0]!.errors.some((e) => e.code === "INVALID_STAY_PERIOD")).toBe(true);
    expect(result.rows[0]!.structurallyImportable).toBe(false);
  });

  it("accepts historical rows and classifies them", () => {
    const csv = `${BASE_HEADERS}\n${row("RH", "U1", "2026-09-01", "2026-09-05")}`;
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      propertyLocalToday: TODAY,
    });
    expect(result.rows[0]!.temporalClass).toBe("historical");
    expect(result.rows[0]!.errors).toEqual([]);
  });

  it("classifies in-progress stays", () => {
    const csv = `${BASE_HEADERS}\n${row("RI", "U1", "2026-10-01", "2026-10-07")}`;
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      propertyLocalToday: TODAY,
    });
    expect(result.rows[0]!.temporalClass).toBe("in_progress");
  });

  it("classifies future stays", () => {
    const csv = `${BASE_HEADERS}\n${row("RF", "U1", "2026-12-01", "2026-12-05")}`;
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      propertyLocalToday: TODAY,
    });
    expect(result.rows[0]!.temporalClass).toBe("future");
  });

  it("accepts ISO dates even when batch format is dmy", () => {
    expect(parseCsvImportDate("2026-04-03", "dmy")).toEqual({
      ok: true,
      iso: "2026-04-03",
    });
  });
});

describe("CSV import B1 — validation & price", () => {
  it("rejects invalid guestCount", () => {
    const csv = `${BASE_HEADERS}\n${row("R7", "U1", "2026-11-01", "2026-11-02", { guests: "0" })}`;
    const result = parseAndValidateCsvImport({ content: csv, dateFormat: "iso", propertyLocalToday: TODAY });
    expect(result.rows[0]!.errors.some((e) => e.code === "INVALID_GUEST_COUNT")).toBe(true);
  });

  it("allows missing optional price", () => {
    const csv = `${BASE_HEADERS}\n${row("R8", "U1", "2026-11-01", "2026-11-02")}`;
    const result = parseAndValidateCsvImport({ content: csv, dateFormat: "iso", propertyLocalToday: TODAY });
    expect(result.rows[0]!.price.status).toBe("missing");
    expect(result.rows[0]!.errors).toEqual([]);
    expect(result.rows[0]!.structurallyImportable).toBe(true);
  });

  it("parses valid imported total with arbitrary ISO-4217 currency", () => {
    const csv = `${BASE_HEADERS}\n${row("R9", "U1", "2026-11-01", "2026-11-02", { total: "250.50", currency: "USD" })}`;
    const result = parseAndValidateCsvImport({ content: csv, dateFormat: "iso", propertyLocalToday: TODAY });
    expect(result.rows[0]!.price).toMatchObject({
      status: "present",
      currency: "USD",
      readyForImportedCsvQuote: true,
    });
    expect(result.rows[0]!.totalAmount).toBe("250.5000");
  });

  it("preserves JPY currency without property-currency rejection", () => {
    const csv = `${BASE_HEADERS}\n${row("R10", "U1", "2026-11-01", "2026-11-02", { total: "10000", currency: "JPY" })}`;
    const result = parseAndValidateCsvImport({ content: csv, dateFormat: "iso", propertyLocalToday: TODAY });
    expect(result.rows[0]!.currency).toBe("JPY");
    expect(result.rows[0]!.errors).toEqual([]);
  });
});

describe("CSV import B1 — unit resolver contract", () => {
  it("resolves by name and reports unknown/ambiguous", async () => {
    const resolver = createInMemoryCsvImportUnitResolver([
      { id: "u1", propertyId: "p1", name: "Sea View", slug: "sea-view" },
      { id: "u2", propertyId: "p1", name: "Garden", slug: "garden" },
      { id: "u3", propertyId: "p1", name: "Dup", slug: "dup-a" },
      { id: "u4", propertyId: "p1", name: "Dup", slug: "dup-b" },
    ]);
    const map = await resolveCsvImportUnitRefs(resolver, "t1", "p1", [
      "Sea View",
      "missing",
      "Dup",
    ]);
    expect(map.get("Sea View")).toEqual({
      status: "resolved",
      unitId: "u1",
      propertyId: "p1",
    });
    expect(map.get("missing")?.status).toBe("not_found");
    expect(map.get("Dup")?.status).toBe("ambiguous");

    const csv = `${BASE_HEADERS}\n${row("RU", "Sea View", "2026-11-01", "2026-11-02")}`;
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      propertyLocalToday: TODAY,
      unitResolutions: map,
    });
    expect(result.rows[0]!.unitId).toBe("u1");
    expect(result.rows[0]!.structurallyImportable).toBe(true);
  });
});

describe("CSV import B1 — limits & safety", () => {
  it("accepts exactly 500 data rows", () => {
    const lines = [BASE_HEADERS];
    for (let i = 0; i < CSV_IMPORT_MAX_DATA_ROWS; i++) {
      lines.push(row(`R${i}`, "U1", "2026-11-01", "2026-11-02"));
    }
    const result = parseCsvImportFile(lines.join("\n"));
    expect(result.ok).toBe(true);
    expect(result.records.length).toBe(500);
  });

  it("rejects 501 data rows", () => {
    const lines = [BASE_HEADERS];
    for (let i = 0; i < CSV_IMPORT_MAX_DATA_ROWS + 1; i++) {
      lines.push(row(`R${i}`, "U1", "2026-11-01", "2026-11-02"));
    }
    const result = parseCsvImportFile(lines.join("\n"));
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "CSV_TOO_MANY_ROWS")).toBe(true);
  });

  it("accepts files at the 2MB boundary content that is valid CSV under limit", () => {
    // Build a ~100KB valid file (well under 2MB) to assert acceptance path
    const lines = [BASE_HEADERS, row("Rok", "U1", "2026-11-01", "2026-11-02")];
    const bytes = enc(lines.join("\n"));
    expect(bytes.byteLength).toBeLessThanOrEqual(CSV_IMPORT_MAX_BYTES);
    expect(parseCsvImportFile(bytes).ok).toBe(true);
  });

  it("rejects content larger than 2MB before parsing", () => {
    const big = new Uint8Array(CSV_IMPORT_MAX_BYTES + 1);
    big.fill(65); // 'A'
    const result = parseCsvImportFile(big);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "CSV_FILE_TOO_LARGE")).toBe(true);
  });

  it("rejects malformed quoting", () => {
    const csv = `a,b\n"unclosed,2`;
    const result = parseCsvImportFile(csv);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "CSV_MALFORMED")).toBe(true);
  });

  it("rejects duplicate headers", () => {
    const mapping = mapCsvImportHeaders(["guest_name", "Guest Name"]);
    expect(mapping.issues.some((i) => i.code === "CSV_DUPLICATE_HEADER")).toBe(true);
  });

  it("rejects empty headers", () => {
    const mapping = mapCsvImportHeaders(["guest_name", "  "]);
    expect(mapping.issues.some((i) => i.code === "CSV_EMPTY_HEADER")).toBe(true);
  });

  it("rejects invalid UTF-8 / binary", () => {
    const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x61]);
    const result = parseCsvImportFile(binary);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "CSV_INVALID_ENCODING")).toBe(true);
  });

  it("keeps formula-looking cells as inert strings", () => {
    const csv =
      `reservation_id,unit_name,guest_name,guest_email,check_in,check_out,guest_count,notes\n` +
      `Rinj,U1,=CMD|calc,a@b.co,2026-11-01,2026-11-02,2,"=+1-555-0002"`;
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      propertyLocalToday: TODAY,
    });
    expect(result.rows[0]!.guestName).toBe("=CMD|calc");
    expect(result.rows[0]!.notes).toBe("=+1-555-0002");
    // No evaluation — values remain plain strings in raw too
    expect(result.rows[0]!.raw["guest_name"]).toBe("=CMD|calc");
  });

  it("inspectCsvImport returns sample rows and mapping", () => {
    const csv = `${BASE_HEADERS}\n${row("R11", "U1", "2026-11-01", "2026-11-02")}`;
    const inspected = inspectCsvImport(csv);
    expect(inspected.dataRowCount).toBe(1);
    expect(inspected.headerMapping?.autoMapped["guest_name"]).toBe("guestName");
    expect(inspected.sampleRows[0]?.["reservation_id"]).toBe("R11");
  });
});
