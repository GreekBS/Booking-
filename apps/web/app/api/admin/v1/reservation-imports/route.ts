import { NextRequest } from "next/server";
import {
  CSV_IMPORT_MAX_BYTES,
  ValidationError,
  type CsvImportCanonicalField,
  type CsvImportDateFormat,
  type CsvImportDelimiter,
} from "@hcp/domain";
import {
  csvImportCanonicalFieldSchema,
  csvImportDateFormatSchema,
  csvImportDelimiterSchema,
  reservationImportMissingPriceStrategySchema,
} from "@hcp/validators";
import {
  createReservationImportDraftUseCase,
  listReservationImportDraftsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeReservationImportBatch,
  serializeReservationImportRejectedRow,
  serializeReservationImportRow,
} from "@/lib/admin/reservation-import-serializers";

function parseOptionalJsonField(raw: FormDataEntryValue | null): unknown {
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new ValidationError("Expected a string form field for JSON values");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError("Invalid JSON in form field");
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const result = await listReservationImportDraftsUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({
      data: result.getValue().map(serializeReservationImportBatch),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("A CSV file is required");
    }
    if (file.size > CSV_IMPORT_MAX_BYTES) {
      throw new ValidationError(
        `CSV exceeds the ${Math.round(CSV_IMPORT_MAX_BYTES / (1024 * 1024))}MB limit`,
      );
    }

    const delimiterRaw = form.get("delimiter");
    const dateFormatRaw = form.get("dateFormat");
    const strategyRaw = form.get("missingPriceStrategy");
    const mappingRaw = parseOptionalJsonField(form.get("columnMapping"));

    const delimiter =
      delimiterRaw == null || delimiterRaw === ""
        ? undefined
        : (csvImportDelimiterSchema.parse(delimiterRaw) as CsvImportDelimiter);
    const dateFormat =
      dateFormatRaw == null || dateFormatRaw === ""
        ? undefined
        : (csvImportDateFormatSchema.parse(dateFormatRaw) as CsvImportDateFormat);
    const missingPriceStrategy =
      strategyRaw == null || strategyRaw === ""
        ? undefined
        : reservationImportMissingPriceStrategySchema.parse(strategyRaw);

    let columnMapping: Record<string, CsvImportCanonicalField | null> | undefined;
    if (mappingRaw !== undefined) {
      if (
        typeof mappingRaw !== "object" ||
        mappingRaw === null ||
        Array.isArray(mappingRaw)
      ) {
        throw new ValidationError("columnMapping must be a JSON object");
      }
      columnMapping = {};
      for (const [header, value] of Object.entries(
        mappingRaw as Record<string, unknown>,
      )) {
        if (value === null) {
          columnMapping[header] = null;
        } else {
          columnMapping[header] = csvImportCanonicalFieldSchema.parse(value);
        }
      }
    }

    const result = await createReservationImportDraftUseCase.execute(
      {
        tenantId: actor.tenantId,
        filename: file.name || "import.csv",
        content: new Uint8Array(await file.arrayBuffer()),
        byteSize: file.size,
        delimiter,
        dateFormat,
        columnMapping,
        missingPriceStrategy,
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());

    const value = result.getValue();
    return apiSuccess(
      {
        batch: serializeReservationImportBatch(value.batch),
        rows: value.rows.map(serializeReservationImportRow),
        rejectedRows: value.rejectedRows.map(serializeReservationImportRejectedRow),
        parseIssues: value.parseIssues,
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
