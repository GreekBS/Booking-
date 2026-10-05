import type {
  ReservationImportBatchRecord,
  ReservationImportConflictBookingRecord,
  ReservationImportRejectedRowRecord,
  ReservationImportRowRecord,
} from "@hcp/domain";

export function serializeReservationImportConflictBooking(
  booking: ReservationImportConflictBookingRecord,
) {
  return {
    id: booking.id,
    guestName: booking.guestName,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
  };
}

export function serializeReservationImportBatch(batch: ReservationImportBatchRecord) {
  return {
    id: batch.id,
    tenantId: batch.tenantId,
    actorId: batch.actorId,
    sourceNamespace: batch.sourceNamespace,
    filename: batch.filename,
    byteSize: batch.byteSize,
    rowCount: batch.rowCount,
    status: batch.status,
    missingPriceStrategy: batch.missingPriceStrategy,
    expiresAt: batch.expiresAt.toISOString(),
    committedAt: batch.committedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}

export function serializeReservationImportRow(row: ReservationImportRowRecord) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    batchId: row.batchId,
    rowNumber: row.rowNumber,
    sourceNamespace: row.sourceNamespace,
    externalReference: row.externalReference,
    unitId: row.unitId,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    temporalClass: row.temporalClass,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    guestPhone: row.guestPhone,
    guestCount: row.guestCount,
    priceSource: row.priceSource,
    importedTotalAmount: row.importedTotalAmount,
    importedCurrency: row.importedCurrency,
    operatorTotalAmount: row.operatorTotalAmount,
    operatorCurrency: row.operatorCurrency,
    conflictResolution: row.conflictResolution,
    replaceBookingId: row.replaceBookingId,
    replaceBookingIds: row.replaceBookingIds,
    conflictSnapshot: row.conflictSnapshot,
    conflictGroupId: row.conflictGroupId,
    recheckRequired: row.recheckRequired,
    status: row.status,
    createdBookingId: row.createdBookingId,
    supersededBookingId: row.supersededBookingId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    payload: row.payload,
    processedAt: row.processedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeReservationImportRejectedRow(
  row: ReservationImportRejectedRowRecord,
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    batchId: row.batchId,
    rowNumber: row.rowNumber,
    payload: row.payload,
    errors: row.errors,
    warnings: row.warnings,
    createdAt: row.createdAt.toISOString(),
  };
}
