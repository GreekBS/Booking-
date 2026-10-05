import {
  evaluateReservationImportCommitEligibility,
  type ReservationImportBatchRecord,
  type ReservationImportBatchStatus,
  type ReservationImportConflictResolution,
  type ReservationImportMissingPriceStrategy,
  type ReservationImportPriceSource,
  type ReservationImportRowRecord,
  type ReservationImportRowStatus,
  type ImportStayTemporalClass,
} from "@hcp/domain";
import type {
  ReservationImportBatchDto,
  ReservationImportDraftDetail,
  ReservationImportRejectedRowDto,
  ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";

/**
 * Thin DTO→domain adapter for C1 eligibility.
 * Does not invent a second rules engine — calls evaluateReservationImportCommitEligibility.
 */

export interface CommitPreviewCounts {
  importCount: number;
  skipCount: number;
  rejectedCount: number;
  /** Distinct existing booking ids that keep_csv rows would replace. */
  replacementBookingCount: number;
}

export type ClientCommitEligibility =
  | {
      kind: "eligible";
      counts: CommitPreviewCounts;
    }
  | {
      kind: "completed";
      counts: CommitPreviewCounts;
    }
  | {
      kind: "blocked";
      reasonKey:
        | "not_draft"
        | "expired"
        | "recheck_required"
        | "not_ready"
        | "unresolved_price"
        | "unresolved_conflict"
        | "exclusivity"
        | "refetch_failed"
        | "mutation_busy"
        | "other";
      message: string;
      counts: CommitPreviewCounts;
    };

function mapBatch(dto: ReservationImportBatchDto): ReservationImportBatchRecord {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    propertyId: dto.propertyId,
    actorId: dto.actorId,
    sourceNamespace: dto.sourceNamespace,
    filename: dto.filename,
    byteSize: dto.byteSize,
    rowCount: dto.rowCount,
    status: dto.status as ReservationImportBatchStatus,
    missingPriceStrategy:
      dto.missingPriceStrategy as ReservationImportMissingPriceStrategy,
    expiresAt: new Date(dto.expiresAt),
    committedAt: dto.committedAt ? new Date(dto.committedAt) : null,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

function mapRow(dto: ReservationImportRowDto): ReservationImportRowRecord {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    batchId: dto.batchId,
    rowNumber: dto.rowNumber,
    sourceNamespace: dto.sourceNamespace,
    externalReference: dto.externalReference,
    unitId: dto.unitId,
    checkIn: dto.checkIn,
    checkOut: dto.checkOut,
    temporalClass: dto.temporalClass as ImportStayTemporalClass,
    guestName: dto.guestName,
    guestEmail: dto.guestEmail,
    guestPhone: dto.guestPhone,
    guestCount: dto.guestCount,
    priceSource: dto.priceSource as ReservationImportPriceSource,
    importedTotalAmount: dto.importedTotalAmount,
    importedCurrency: dto.importedCurrency,
    operatorTotalAmount: dto.operatorTotalAmount,
    operatorCurrency: dto.operatorCurrency,
    conflictResolution:
      dto.conflictResolution as ReservationImportConflictResolution,
    replaceBookingId: dto.replaceBookingId,
    replaceBookingIds: dto.replaceBookingIds ?? [],
    conflictSnapshot: dto.conflictSnapshot ?? {},
    conflictGroupId: dto.conflictGroupId,
    recheckRequired: dto.recheckRequired,
    status: dto.status as ReservationImportRowStatus,
    createdBookingId: dto.createdBookingId,
    supersededBookingId: dto.supersededBookingId,
    errorCode: dto.errorCode,
    errorMessage: dto.errorMessage,
    payload: dto.payload ?? {},
    processedAt: dto.processedAt ? new Date(dto.processedAt) : null,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

export function computeCommitPreviewCounts(
  rows: ReservationImportRowDto[],
  rejectedRows: ReservationImportRejectedRowDto[],
): CommitPreviewCounts {
  let importCount = 0;
  let skipCount = 0;
  const replaceIds = new Set<string>();
  for (const row of rows) {
    if (row.status === "ready") {
      importCount += 1;
      if (row.conflictResolution === "keep_csv") {
        for (const id of row.replaceBookingIds ?? []) replaceIds.add(id);
      }
    } else if (
      row.status === "skipped" ||
      row.status === "skipped_already_imported" ||
      row.conflictResolution === "keep_existing"
    ) {
      skipCount += 1;
    } else if (row.status === "imported") {
      importCount += 1;
      for (const id of row.replaceBookingIds ?? []) replaceIds.add(id);
      const payloadIds = row.payload?.supersededBookingIds;
      if (Array.isArray(payloadIds)) {
        for (const id of payloadIds) {
          if (typeof id === "string") replaceIds.add(id);
        }
      }
    }
  }
  return {
    importCount,
    skipCount,
    rejectedCount: rejectedRows.length,
    replacementBookingCount: replaceIds.size,
  };
}

type CommitBlockReasonKey = Extract<
  ClientCommitEligibility,
  { kind: "blocked" }
>["reasonKey"];

function classifyBlockReason(message: string): CommitBlockReasonKey {
  const m = message.toLowerCase();
  if (m.includes("expired")) return "expired";
  if (m.includes("recheck")) return "recheck_required";
  if (m.includes("unresolved price") || m.includes("price is missing")) {
    return "unresolved_price";
  }
  if (m.includes("overlapping keep_csv") || m.includes("exclusivity")) {
    return "exclusivity";
  }
  if (
    m.includes("pending") ||
    m.includes("failed") ||
    m.includes("not commit-eligible") ||
    m.includes("already terminal")
  ) {
    return "not_ready";
  }
  if (
    m.includes("keep_existing must be skipped") ||
    m.includes("conflict") ||
    m.includes("undecided")
  ) {
    return "unresolved_conflict";
  }
  if (m.includes("not draft") || m.includes("already completed")) {
    return "not_draft";
  }
  return "other";
}

const BLOCK_MESSAGES: Record<CommitBlockReasonKey, string> = {
  not_draft: "Η εισαγωγή δεν είναι πλέον πρόχειρη και δεν μπορεί να ολοκληρωθεί.",
  expired: "Το πρόχειρο έχει λήξει και δεν μπορεί να ολοκληρωθεί.",
  recheck_required:
    "Απαιτείται επανέλεγχος συγκρούσεων πριν από την ολοκλήρωση.",
  not_ready:
    "Υπάρχουν γραμμές που δεν είναι έτοιμες. Ολοκληρώστε τις εκκρεμότητες πριν συνεχίσετε.",
  unresolved_price:
    "Υπάρχουν κρατήσεις χωρίς τιμή. Ορίστε τιμή πριν από την ολοκλήρωση.",
  unresolved_conflict:
    "Υπάρχουν ανεπίλυτες συγκρούσεις. Επιλέξτε απόφαση πριν από την ολοκλήρωση.",
  exclusivity:
    "Υπάρχουν επικαλυπτόμενες επιλογές «Διατήρηση CSV». Επιλύστε τις πριν συνεχίσετε.",
  refetch_failed:
    "Η κατάσταση από τον διακομιστή δεν είναι αξιόπιστη. Ανανεώστε πριν συνεχίσετε.",
  mutation_busy: "Περιμένετε να ολοκληρωθεί η τρέχουσα ενέργεια.",
  other: "Η εισαγωγή δεν είναι έτοιμη για ολοκλήρωση.",
};

/**
 * Client commit gate — reuses C1 evaluateReservationImportCommitEligibility.
 * Additional UI-only fail-closed gates: refetchFailed, mutationBusy.
 */
export function evaluateClientCommitEligibility(
  detail: ReservationImportDraftDetail,
  options: {
    now?: Date;
    refetchFailed?: boolean;
    mutationBusy?: boolean;
  } = {},
): ClientCommitEligibility {
  const counts = computeCommitPreviewCounts(detail.rows, detail.rejectedRows);
  const now = options.now ?? new Date();

  if (detail.batch.status === "completed") {
    return { kind: "completed", counts };
  }

  if (options.refetchFailed) {
    return {
      kind: "blocked",
      reasonKey: "refetch_failed",
      message: BLOCK_MESSAGES.refetch_failed,
      counts,
    };
  }

  if (options.mutationBusy) {
    return {
      kind: "blocked",
      reasonKey: "mutation_busy",
      message: BLOCK_MESSAGES.mutation_busy,
      counts,
    };
  }

  if (detail.batch.status !== "draft") {
    return {
      kind: "blocked",
      reasonKey: "not_draft",
      message: BLOCK_MESSAGES.not_draft,
      counts,
    };
  }

  const result = evaluateReservationImportCommitEligibility({
    batch: mapBatch(detail.batch),
    rows: detail.rows.map(mapRow),
    now,
  });

  if (result.isFailure) {
    const errMessage = result.getError().message;
    const reasonKey = classifyBlockReason(errMessage);
    return {
      kind: "blocked",
      reasonKey,
      message: BLOCK_MESSAGES[reasonKey] ?? BLOCK_MESSAGES.other,
      counts,
    };
  }

  const plans = result.getValue().plans;
  const importCount = plans.filter((p) => p.kind === "import").length;
  const skipCount = plans.filter((p) => p.kind === "durable_skip").length;
  const replaceIds = new Set<string>();
  for (const plan of plans) {
    if (plan.kind !== "import") continue;
    if (plan.row.conflictResolution === "keep_csv") {
      for (const id of plan.row.replaceBookingIds ?? []) replaceIds.add(id);
    }
  }

  return {
    kind: "eligible",
    counts: {
      importCount,
      skipCount,
      rejectedCount: detail.rejectedRows.length,
      replacementBookingCount: replaceIds.size,
    },
  };
}
