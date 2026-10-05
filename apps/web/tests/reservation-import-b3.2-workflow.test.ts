import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_DATA_ROWS,
  inspectCsvImport,
  parseAndValidateCsvImport,
} from "@hcp/domain";
import { adminFetch } from "@/lib/admin/api";
import { createReservationImportDraft } from "@/lib/admin/reservation-import-api";
import { csvIssueMessageEl } from "@/features/reservation-import/csv-issue-messages";
import {
  ALL_CSV_CANONICAL_FIELDS,
  CSV_FIELD_LABELS_EL,
  isRequiredCsvField,
} from "@/features/reservation-import/csv-field-labels";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function enc(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const EN_HEADERS =
  "reservation_id,unit_name,guest_name,guest_email,check_in,check_out,guest_count,total_amount,currency";

function enRow(
  ref: string,
  unit: string,
  checkIn: string,
  checkOut: string,
  extras: { total?: string; currency?: string; guests?: string } = {},
): string {
  return [
    ref,
    unit,
    "Ada Lovelace",
    "ada@example.com",
    checkIn,
    checkOut,
    extras.guests ?? "2",
    extras.total ?? "",
    extras.currency ?? "",
  ].join(",");
}

/** Option A eligibility mirrored from wizard (structural gate before POST). */
function isCreateEligible(input: {
  missingRequired: number;
  dateFormatRequired: boolean;
  fileOrMappingErrors: number;
  structuralRowErrors: number;
  structurallyImportableCount: number;
  rowCount: number;
}): boolean {
  if (input.missingRequired > 0) return false;
  if (input.dateFormatRequired) return false;
  if (input.fileOrMappingErrors > 0) return false;
  if (input.structuralRowErrors > 0) return false;
  if (input.structurallyImportableCount < 1) return false;
  if (input.rowCount > CSV_IMPORT_MAX_DATA_ROWS) return false;
  return true;
}

describe("B3.2 — source contracts & UI wiring", () => {
  it("landing page hosts upload/mapping/preview workflow (not B3.1 placeholder)", () => {
    const landing = read("features/reservation-import/ReservationImportLandingPage.tsx");
    expect(landing).toContain("Εισαγωγή κρατήσεων από CSV");
    expect(landing).toContain("ReservationImportUpload");
    expect(landing).toContain("ReservationImportMapping");
    expect(landing).toContain("ReservationImportPreview");
    expect(landing).toContain("Δημιουργία πρόχειρης εισαγωγής");
    expect(landing).toContain("useReservationImportWizard");
    expect(landing).toContain("/dashboard/bookings/import/");
    expect(landing).not.toContain("Μεταφόρτωση CSV — σύντομα");
    expect(landing).not.toContain("localStorage");
    expect(landing).not.toContain("sessionStorage");
    expect(landing).not.toContain("keep_existing");
    expect(landing).not.toContain("talos_for_all_missing");
  });

  it("reuses domain inspect/parse contracts (no second parser)", () => {
    const wizard = read("features/reservation-import/useReservationImportWizard.ts");
    expect(wizard).toContain("inspectCsvImport");
    expect(wizard).toContain("parseAndValidateCsvImport");
    expect(wizard).toContain("CSV_IMPORT_MAX_BYTES");
    expect(wizard).toContain("CSV_IMPORT_MAX_DATA_ROWS");
    expect(wizard).not.toContain("Papa.parse");
    expect(wizard).not.toContain("localStorage");
  });

  it("canonical fields match B1 required/optional names", () => {
    expect(ALL_CSV_CANONICAL_FIELDS).toContain("externalReference");
    expect(ALL_CSV_CANONICAL_FIELDS).toContain("totalAmount");
    expect(ALL_CSV_CANONICAL_FIELDS).toContain("channelSource");
    expect(isRequiredCsvField("totalAmount")).toBe(false);
    expect(isRequiredCsvField("guestCount")).toBe(true);
    expect(CSV_FIELD_LABELS_EL.unitRef).toContain("μονάδα");
  });

  it("create API appends exact multipart fields", () => {
    const api = read("lib/admin/reservation-import-api.ts");
    expect(api).toContain('form.append("file"');
    expect(api).toContain('form.append("delimiter"');
    expect(api).toContain('form.append("dateFormat"');
    expect(api).toContain('form.append("columnMapping"');
    expect(api).toContain("JSON.stringify(input.columnMapping)");
    expect(api).toContain("createReservationImportDraft");
  });

  it("adminFetch skips JSON Content-Type for FormData", () => {
    const api = read("lib/admin/api.ts");
    expect(api).toContain("!(init.body instanceof FormData)");
    expect(api).toContain("application/json");
  });

  it("BookingCreateMenu and manual booking entry remain intact", () => {
    const menu = read("features/reservation-import/BookingCreateMenu.tsx");
    expect(menu).toContain('href="/dashboard/bookings/new"');
    expect(menu).toContain('href="/dashboard/bookings/import"');
    const manual = read("features/bookings/ManualBookingPage.tsx");
    expect(manual).toContain('title="Νέα κράτηση"');
    expect(manual).not.toContain("reservation-import");
  });
});

describe("B3.2 — client inspect via @hcp/domain", () => {
  it("detects headers and comma delimiter with EN auto-mapping", () => {
    const csv = enc(
      `${EN_HEADERS}\n${enRow("R1", "Sea View", "2026-11-01", "2026-11-05", { total: "100", currency: "EUR" })}`,
    );
    const inspected = inspectCsvImport(csv);
    expect(inspected.delimiter).toBe(",");
    expect(inspected.headerMapping?.autoMapped["reservation_id"]).toBe(
      "externalReference",
    );
    expect(inspected.headerMapping?.missingRequiredFields).toEqual([]);
  });

  it("detects semicolon and tab delimiters", () => {
    const semi = inspectCsvImport(
      enc(
        "reservation_id;unit_name;guest_name;guest_email;check_in;check_out;guest_count\nR2;U1;Bob;bob@example.com;2026-11-01;2026-11-03;2",
      ),
    );
    expect(semi.delimiter).toBe(";");
    const tab = inspectCsvImport(
      enc(
        "reservation_id\tunit_name\tguest_name\tguest_email\tcheck_in\tcheck_out\tguest_count\nR3\tU1\tBob\tbob@example.com\t2026-11-01\t2026-11-03\t2",
      ),
    );
    expect(tab.delimiter).toBe("\t");
  });

  it("auto-maps Greek aliases", () => {
    const csv = enc(
      "Κωδικός κράτησης,Μονάδα,Όνομα,Email,Άφιξη,Αναχώρηση,Επισκέπτες\nX1,U1,Νίκος,n@ex.com,2026-11-01,2026-11-03,2",
    );
    const inspected = inspectCsvImport(csv);
    expect(inspected.headerMapping?.autoMapped["Όνομα"]).toBe("guestName");
    expect(inspected.headerMapping?.autoMapped["Άφιξη"]).toBe("checkIn");
    expect(inspected.headerMapping?.missingRequiredFields).toEqual([]);
  });

  it("rejects oversize and too many rows via domain limits", () => {
    expect(CSV_IMPORT_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(CSV_IMPORT_MAX_DATA_ROWS).toBe(500);
    const huge = new Uint8Array(CSV_IMPORT_MAX_BYTES + 1);
    const inspected = inspectCsvImport(huge);
    expect(inspected.issues.some((i) => i.code === "CSV_FILE_TOO_LARGE")).toBe(
      true,
    );

    const lines = [EN_HEADERS];
    for (let i = 0; i < 501; i++) {
      lines.push(enRow(`R${i}`, "U1", "2026-11-01", "2026-11-02"));
    }
    const many = parseAndValidateCsvImport({ content: enc(lines.join("\n")) });
    expect(many.issues.some((i) => i.code === "CSV_TOO_MANY_ROWS")).toBe(true);
  });

  it("rejects invalid UTF-8 encoding", () => {
    // Invalid UTF-8 continuation bytes
    const invalid = new Uint8Array([0xff, 0xfe, 0xfd]);
    const inspected = inspectCsvImport(invalid);
    expect(inspected.issues.some((i) => i.code === "CSV_INVALID_ENCODING")).toBe(
      true,
    );
  });

  it("handles BOM/UTF-8 and keeps formula-like cells inert", () => {
    const withBom = enc(
      `\uFEFF${EN_HEADERS}\n${enRow("=CMD", "U1", "2026-11-01", "2026-11-02", { total: "+123" })}`,
    );
    const result = parseAndValidateCsvImport({
      content: withBom,
      dateFormat: "iso",
    });
    expect(result.rows[0]!.externalReference).toBe("=CMD");
    expect(result.rows[0]!.price.status).toBe("invalid");
  });
});

describe("B3.2 — dates, price, historical, Option A gate", () => {
  it("allows ISO and requires choice for ambiguous dates", () => {
    const iso = parseAndValidateCsvImport({
      content: enc(
        `${EN_HEADERS}\n${enRow("R1", "U1", "2026-11-01", "2026-11-05")}`,
      ),
      dateFormat: "iso",
    });
    expect(iso.rows[0]!.errors).toEqual([]);

    const ambiguous = parseAndValidateCsvImport({
      content: enc(
        `${EN_HEADERS}\n${enRow("R1", "U1", "03/04/2026", "05/04/2026")}`,
      ),
    });
    expect(
      ambiguous.issues.some(
        (i) => i.severity === "error" && i.code === "DATE_FORMAT_REQUIRED",
      ),
    ).toBe(true);
    expect(
      isCreateEligible({
        missingRequired: 0,
        dateFormatRequired: true,
        fileOrMappingErrors: 0,
        structuralRowErrors: 1,
        structurallyImportableCount: 0,
        rowCount: 1,
      }),
    ).toBe(false);

    const dmy = parseAndValidateCsvImport({
      content: enc(
        `${EN_HEADERS}\n${enRow("R1", "U1", "03/04/2026", "05/04/2026")}`,
      ),
      dateFormat: "dmy",
    });
    expect(dmy.rows[0]!.checkIn).toBe("2026-04-03");
  });

  it("allows historical dates and missing price without blocking create eligibility", () => {
    const result = parseAndValidateCsvImport({
      content: enc(
        `${EN_HEADERS}\n${enRow("RH", "U1", "2020-01-01", "2020-01-05")}`,
      ),
      dateFormat: "iso",
      propertyLocalToday: "2026-10-03",
    });
    expect(result.rows[0]!.temporalClass).toBe("historical");
    expect(result.rows[0]!.price.status).toBe("missing");
    expect(result.rows[0]!.errors).toEqual([]);
    expect(result.structurallyImportableCount).toBe(1);
    expect(
      isCreateEligible({
        missingRequired: 0,
        dateFormatRequired: false,
        fileOrMappingErrors: 0,
        structuralRowErrors: 0,
        structurallyImportableCount: 1,
        rowCount: 1,
      }),
    ).toBe(true);
  });

  it("blocks create on structural invalid rows (Option A durability)", () => {
    const result = parseAndValidateCsvImport({
      content: enc(
        `${EN_HEADERS}\n${enRow("R1", "U1", "2026-11-05", "2026-11-05")}`,
      ),
      dateFormat: "iso",
    });
    const structuralErrors = result.rows.flatMap((r) => r.errors);
    expect(structuralErrors.some((e) => e.code === "INVALID_STAY_PERIOD")).toBe(
      true,
    );
    expect(
      isCreateEligible({
        missingRequired: 0,
        dateFormatRequired: false,
        fileOrMappingErrors: 0,
        structuralRowErrors: structuralErrors.length,
        structurallyImportableCount: result.structurallyImportableCount,
        rowCount: result.rowCount,
      }),
    ).toBe(false);
  });

  it("blocks create when required mapping missing", () => {
    const inspected = inspectCsvImport(enc("guest_name,email\nAda,a@b.co"));
    expect(inspected.headerMapping!.missingRequiredFields.length).toBeGreaterThan(
      0,
    );
    expect(
      isCreateEligible({
        missingRequired: inspected.headerMapping!.missingRequiredFields.length,
        dateFormatRequired: false,
        fileOrMappingErrors: inspected.issues.filter((i) => i.severity === "error")
          .length,
        structuralRowErrors: 0,
        structurallyImportableCount: 0,
        rowCount: 1,
      }),
    ).toBe(false);
  });

  it("renders Greek issue messages with row numbers", () => {
    const msg = csvIssueMessageEl({
      code: "INVALID_STAY_PERIOD",
      severity: "error",
      message: "bad",
      rowNumber: 4,
      field: "checkOut",
    });
    expect(msg).toContain("Γραμμή 4");
    expect(msg).toContain("αναχώρηση");
  });
});

describe("B3.2 — multipart adminFetch + create draft request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not force JSON Content-Type for FormData; still sets JSON for string body", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("file", new Blob(["a,b\n1,2"], { type: "text/csv" }), "t.csv");
    await adminFetch<{ ok: boolean }>("/reservation-imports", {
      method: "POST",
      tenantId: "t1",
      body: form,
    });
    const formHeaders = new Headers(fetchMock.mock.calls[0]![1]!.headers);
    expect(formHeaders.get("Content-Type")).toBeNull();
    expect(formHeaders.get("X-Tenant-Id")).toBe("t1");

    await adminFetch<{ ok: boolean }>("/reservation-imports/x/discard", {
      method: "POST",
      tenantId: "t1",
      body: "{}",
    });
    const jsonHeaders = new Headers(fetchMock.mock.calls[1]![1]!.headers);
    expect(jsonHeaders.get("Content-Type")).toBe("application/json");
  });

  it("createReservationImportDraft sends file, mapping, dateFormat, delimiter", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          batch: {
            id: "batch-1",
            tenantId: "t1",
            actorId: "u1",
            sourceNamespace: "csv",
            filename: "t.csv",
            byteSize: 10,
            rowCount: 1,
            status: "draft",
            missingPriceStrategy: "undecided",
            expiresAt: "2026-10-07T00:00:00.000Z",
            committedAt: null,
            createdAt: "2026-10-04T00:00:00.000Z",
            updatedAt: "2026-10-04T00:00:00.000Z",
          },
          rows: [],
          rejectedRows: [
            {
              id: "rej-1",
              tenantId: "t1",
              batchId: "batch-1",
              rowNumber: 1,
              payload: { unitRef: "Unknown" },
              errors: [
                {
                  code: "UNIT_NOT_FOUND",
                  severity: "error",
                  message: "Unit not found",
                  rowNumber: 1,
                  field: "unitRef",
                },
              ],
              warnings: [],
              createdAt: "2026-10-04T00:00:00.000Z",
            },
          ],
          parseIssues: [],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(
      [`${EN_HEADERS}\n${enRow("R1", "Unknown", "2026-11-01", "2026-11-02")}`],
      "import.csv",
      { type: "text/csv" },
    );
    const result = await createReservationImportDraft("t1", {
      file,
      delimiter: ",",
      dateFormat: "iso",
      columnMapping: {
        reservation_id: "externalReference",
        unit_name: "unitRef",
        guest_name: "guestName",
        guest_email: "guestEmail",
        check_in: "checkIn",
        check_out: "checkOut",
        guest_count: "guestCount",
        total_amount: null,
        currency: null,
      },
    });

    expect(result.batch.id).toBe("batch-1");
    expect(result.rejectedRows).toHaveLength(1);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("file")).toBeTruthy();
    expect(body.get("delimiter")).toBe(",");
    expect(body.get("dateFormat")).toBe("iso");
    const mapping = JSON.parse(String(body.get("columnMapping")));
    expect(mapping.reservation_id).toBe("externalReference");
    expect(mapping.total_amount).toBeNull();
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBeNull();
  });
});

describe("B3.2 — duplicate submit + rejectedRows warning wiring", () => {
  it("wizard disables create while pending and surfaces rejectedRows warning", () => {
    const wizard = read("features/reservation-import/useReservationImportWizard.ts");
    expect(wizard).toContain("if (!tenantId || !file || !canCreate || creating)");
    expect(wizard).toContain("setCreating(true)");
    expect(wizard).toContain("RESERVATION_IMPORT_UNPERSISTED_WARNING");
    expect(wizard).toContain("result.rejectedRows");
    expect(wizard).toContain("structuralRowErrors.length > 0");
    const landing = read("features/reservation-import/ReservationImportLandingPage.tsx");
    expect(landing).toContain("disabled={!wizard.canCreate || wizard.creating}");
    expect(landing).toContain("outcome.warning");
  });
});
