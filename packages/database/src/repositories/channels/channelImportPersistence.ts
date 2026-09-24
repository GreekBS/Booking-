import type { ExternalReservationLink } from "@hcp/domain";
import type { ExternalReservationLinkStatus as PrismaExternalReservationLinkStatus } from "@prisma/client";
import type { TransactionClient } from "../OutboxRepository";

export async function persistExternalReservationLinkTx(
  tx: TransactionClient,
  link: ExternalReservationLink,
): Promise<void> {
  const props = link.toProps();

  await tx.externalReservationLink.create({
    data: {
      tenantId: props.tenantId,
      id: props.id,
      provider: props.provider,
      connectionId: props.connectionId,
      externalReservationId: props.externalReservationId,
      bookingId: props.bookingId,
      mappingId: props.mappingId,
      mappingVersionAtImport: props.mappingVersionAtImport,
      mappingVersionAtLastSync: props.mappingVersionAtLastSync,
      externalRevision: props.externalRevision,
      status: props.status as PrismaExternalReservationLinkStatus,
      conflictReason: props.conflictReason,
      importedAt: props.importedAt,
      lastSyncedAt: props.lastSyncedAt,
      lastExternalUpdateAt: props.lastExternalUpdateAt,
      archivedAt: props.archivedAt,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    },
  });
}

export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}
