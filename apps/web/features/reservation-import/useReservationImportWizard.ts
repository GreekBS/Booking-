"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_DATA_ROWS,
  CSV_IMPORT_REQUIRED_FIELDS,
  inspectCsvImport,
  parseAndValidateCsvImport,
  type CsvImportCanonicalField,
  type CsvImportDateFormat,
  type CsvImportDelimiter,
  type CsvImportHeaderMappingResult,
  type CsvImportIssue,
  type CsvImportParseResult,
} from "@hcp/domain";
import {
  createReservationImportDraft,
  type CreateReservationImportDraftResponse,
} from "@/lib/admin/reservation-import-api";
import { AdminApiError } from "@/lib/admin/api";
import {
  RESERVATION_IMPORT_FILE_TOO_LARGE,
  RESERVATION_IMPORT_UNPERSISTED_WARNING,
  RESERVATION_IMPORT_UNSUPPORTED_FILE,
} from "./reservation-import-copy";

export type WizardColumnMapping = Record<string, CsvImportCanonicalField | null>;

export interface ReservationImportWizardState {
  file: File | null;
  fileBytes: Uint8Array | null;
  inspectIssues: CsvImportIssue[];
  headerMapping: CsvImportHeaderMappingResult | null;
  delimiter: CsvImportDelimiter | null;
  delimiterOverride: CsvImportDelimiter | "";
  dateFormat: CsvImportDateFormat | "";
  columnMapping: WizardColumnMapping;
  parseResult: CsvImportParseResult | null;
  localError: string | null;
  creating: boolean;
  createError: string | null;
  createWarning: string | null;
  lastCreateResult: CreateReservationImportDraftResponse | null;
}

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return true;
  const type = (file.type || "").toLowerCase();
  return type === "text/csv" || type === "application/vnd.ms-excel";
}

function mappingFromHeaders(
  headerMapping: CsvImportHeaderMappingResult,
): WizardColumnMapping {
  const next: WizardColumnMapping = {};
  for (const header of headerMapping.headers) {
    next[header] =
      headerMapping.mapping[header] === undefined
        ? null
        : headerMapping.mapping[header];
  }
  return next;
}

function needsDateFormat(result: CsvImportParseResult | null): boolean {
  if (!result) return false;
  return result.issues.some(
    (i) => i.severity === "error" && i.code === "DATE_FORMAT_REQUIRED",
  );
}

export function useReservationImportWizard(tenantId: string | null) {
  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [inspectIssues, setInspectIssues] = useState<CsvImportIssue[]>([]);
  const [headerMapping, setHeaderMapping] =
    useState<CsvImportHeaderMappingResult | null>(null);
  /** Snapshot of alias auto-map at inspect/delimiter reset (display only). */
  const [autoMappedSnapshot, setAutoMappedSnapshot] = useState<
    Record<string, CsvImportCanonicalField>
  >({});
  const [delimiter, setDelimiter] = useState<CsvImportDelimiter | null>(null);
  const [delimiterOverride, setDelimiterOverride] = useState<
    CsvImportDelimiter | ""
  >("");
  const [dateFormat, setDateFormat] = useState<CsvImportDateFormat | "">("");
  const [columnMapping, setColumnMapping] = useState<WizardColumnMapping>({});
  const [parseResult, setParseResult] = useState<CsvImportParseResult | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createWarning, setCreateWarning] = useState<string | null>(null);
  const [lastCreateResult, setLastCreateResult] =
    useState<CreateReservationImportDraftResponse | null>(null);

  const resetFileState = useCallback(() => {
    setFile(null);
    setFileBytes(null);
    setInspectIssues([]);
    setHeaderMapping(null);
    setAutoMappedSnapshot({});
    setDelimiter(null);
    setDelimiterOverride("");
    setDateFormat("");
    setColumnMapping({});
    setParseResult(null);
    setLocalError(null);
    setCreateError(null);
    setCreateWarning(null);
    setLastCreateResult(null);
  }, []);

  const recompute = useCallback(
    (input: {
      bytes: Uint8Array;
      mapping: WizardColumnMapping;
      dateFormat: CsvImportDateFormat | "";
      delimiterOverride: CsvImportDelimiter | "";
    }) => {
      const delim =
        input.delimiterOverride === "" ? undefined : input.delimiterOverride;
      const inspect = inspectCsvImport(input.bytes, {
        delimiter: delim,
        columnMapping: input.mapping,
      });
      setInspectIssues(inspect.issues);
      setHeaderMapping(inspect.headerMapping);
      setDelimiter(inspect.delimiter);

      const parsed = parseAndValidateCsvImport({
        content: input.bytes,
        delimiter: delim,
        dateFormat: input.dateFormat === "" ? undefined : input.dateFormat,
        columnMapping: input.mapping,
      });
      setParseResult(parsed);
      return { inspect, parsed };
    },
    [],
  );

  const selectFile = useCallback(
    async (next: File | null) => {
      resetFileState();
      if (!next) return;

      if (!isCsvFile(next)) {
        setLocalError(RESERVATION_IMPORT_UNSUPPORTED_FILE);
        return;
      }
      if (next.size > CSV_IMPORT_MAX_BYTES) {
        setLocalError(RESERVATION_IMPORT_FILE_TOO_LARGE);
        return;
      }

      try {
        const buffer = new Uint8Array(await next.arrayBuffer());
        setFile(next);
        setFileBytes(buffer);

        const inspect = inspectCsvImport(buffer);
        setInspectIssues(inspect.issues);
        setHeaderMapping(inspect.headerMapping);
        setAutoMappedSnapshot(inspect.headerMapping?.autoMapped ?? {});
        setDelimiter(inspect.delimiter);

        const mapping = inspect.headerMapping
          ? mappingFromHeaders(inspect.headerMapping)
          : {};
        setColumnMapping(mapping);

        const parsed = parseAndValidateCsvImport({
          content: buffer,
          columnMapping: mapping,
        });
        setParseResult(parsed);
        setLocalError(null);
      } catch {
        setLocalError("Αποτυχία ανάγνωσης αρχείου CSV.");
      }
    },
    [resetFileState],
  );

  const updateColumnMapping = useCallback(
    (header: string, field: CsvImportCanonicalField | null | "") => {
      if (!fileBytes) return;
      const next: WizardColumnMapping = { ...columnMapping };
      // Clear any other header already mapped to this field (1:1)
      if (field) {
        for (const [h, mapped] of Object.entries(next)) {
          if (h !== header && mapped === field) next[h] = null;
        }
        next[header] = field;
      } else {
        next[header] = null;
      }
      setColumnMapping(next);
      recompute({
        bytes: fileBytes,
        mapping: next,
        dateFormat,
        delimiterOverride,
      });
    },
    [fileBytes, columnMapping, dateFormat, delimiterOverride, recompute],
  );

  const updateDateFormat = useCallback(
    (value: CsvImportDateFormat | "") => {
      if (!fileBytes) return;
      setDateFormat(value);
      recompute({
        bytes: fileBytes,
        mapping: columnMapping,
        dateFormat: value,
        delimiterOverride,
      });
    },
    [fileBytes, columnMapping, delimiterOverride, recompute],
  );

  const updateDelimiterOverride = useCallback(
    (value: CsvImportDelimiter | "") => {
      if (!fileBytes) return;
      setDelimiterOverride(value);
      // Remap from fresh auto when delimiter changes headers order/identity
      const inspect = inspectCsvImport(fileBytes, {
        delimiter: value === "" ? undefined : value,
      });
      const mapping = inspect.headerMapping
        ? mappingFromHeaders(inspect.headerMapping)
        : {};
      setAutoMappedSnapshot(inspect.headerMapping?.autoMapped ?? {});
      setColumnMapping(mapping);
      setDateFormat("");
      recompute({
        bytes: fileBytes,
        mapping,
        dateFormat: "",
        delimiterOverride: value,
      });
    },
    [fileBytes, recompute],
  );

  const missingRequiredFields = useMemo(() => {
    if (!headerMapping) return [...CSV_IMPORT_REQUIRED_FIELDS];
    return headerMapping.missingRequiredFields;
  }, [headerMapping]);

  const dateFormatRequired = needsDateFormat(parseResult);

  const structuralRowErrors = useMemo(() => {
    if (!parseResult) return [] as CsvImportIssue[];
    return parseResult.rows.flatMap((r) => r.errors);
  }, [parseResult]);

  const fileOrMappingErrors = useMemo(() => {
    const issues: CsvImportIssue[] = [];
    for (const i of inspectIssues) {
      if (i.severity === "error") issues.push(i);
    }
    if (parseResult) {
      for (const i of parseResult.issues) {
        if (i.severity === "error" && i.rowNumber == null) issues.push(i);
      }
    }
    return issues;
  }, [inspectIssues, parseResult]);

  const canCreate = useMemo(() => {
    if (!file || !fileBytes || !parseResult || !headerMapping) return false;
    if (creating) return false;
    if (missingRequiredFields.length > 0) return false;
    if (dateFormatRequired) return false;
    if (fileOrMappingErrors.length > 0) return false;
    if (structuralRowErrors.length > 0) return false;
    if (parseResult.structurallyImportableCount < 1) return false;
    if (parseResult.rowCount > CSV_IMPORT_MAX_DATA_ROWS) return false;
    return true;
  }, [
    file,
    fileBytes,
    parseResult,
    headerMapping,
    creating,
    missingRequiredFields,
    dateFormatRequired,
    fileOrMappingErrors,
    structuralRowErrors,
  ]);

  const createDraft = useCallback(async (): Promise<{
    batchId: string | null;
    warning: string | null;
    error: string | null;
  }> => {
    if (!tenantId || !file || !canCreate || creating) {
      return { batchId: null, warning: null, error: null };
    }
    setCreating(true);
    setCreateError(null);
    setCreateWarning(null);
    try {
      const result = await createReservationImportDraft(tenantId, {
        file,
        columnMapping,
        dateFormat: dateFormat === "" ? undefined : dateFormat,
        delimiter:
          delimiterOverride === ""
            ? delimiter ?? undefined
            : delimiterOverride,
      });
      setLastCreateResult(result);
      const warning =
        result.unpersisted.length > 0
          ? `${RESERVATION_IMPORT_UNPERSISTED_WARNING} (${result.unpersisted.length})`
          : null;
      if (warning) setCreateWarning(warning);
      return { batchId: result.batch.id, warning, error: null };
    } catch (error) {
      const message =
        error instanceof AdminApiError
          ? error.message
          : "Αποτυχία δημιουργίας πρόχειρης εισαγωγής.";
      setCreateError(message);
      return { batchId: null, warning: null, error: message };
    } finally {
      setCreating(false);
    }
  }, [
    tenantId,
    file,
    canCreate,
    creating,
    columnMapping,
    dateFormat,
    delimiterOverride,
    delimiter,
  ]);

  return {
    file,
    fileBytes,
    inspectIssues,
    headerMapping,
    autoMappedSnapshot,
    delimiter,
    delimiterOverride,
    dateFormat,
    columnMapping,
    parseResult,
    localError,
    creating,
    createError,
    createWarning,
    lastCreateResult,
    missingRequiredFields,
    dateFormatRequired,
    structuralRowErrors,
    fileOrMappingErrors,
    canCreate,
    limits: {
      maxBytes: CSV_IMPORT_MAX_BYTES,
      maxRows: CSV_IMPORT_MAX_DATA_ROWS,
    },
    selectFile,
    resetFileState,
    updateColumnMapping,
    updateDateFormat,
    updateDelimiterOverride,
    createDraft,
  };
}
