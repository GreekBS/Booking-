import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  ConflictError,
  type CleaningLocationQrAccessRecord,
  type ICleaningLocationQrAccessRepository,
  type IssueCleaningLocationQrCommand,
  type UnitQrStatus,
} from "@hcp/domain";
import { withTenantTransaction } from "../../../client";

type QrRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  cleaningLocationId: string;
  tokenHash: string;
  status: string;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
};

function mapQr(row: QrRow): CleaningLocationQrAccessRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    cleaningLocationId: row.cleaningLocationId,
    // CHAR(64) is space padded on read for shorter values; normalize defensively.
    tokenHash: row.tokenHash.trim(),
    status: row.status as UnitQrStatus,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
    revokedAt: row.revokedAt,
  };
}

export class PrismaCleaningLocationQrAccessRepository
  implements ICleaningLocationQrAccessRepository
{
  async findActiveByLocation(
    tenantId: string,
    cleaningLocationId: string,
  ): Promise<CleaningLocationQrAccessRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.cleaningLocationQrAccess.findFirst({
        where: { tenantId, cleaningLocationId, status: "ACTIVE" },
      });
      return row ? mapQr(row as QrRow) : null;
    });
  }

  async findByTokenHash(
    tenantId: string,
    tokenHash: string,
  ): Promise<CleaningLocationQrAccessRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.cleaningLocationQrAccess.findFirst({
        where: { tenantId, tokenHash },
      });
      return row ? mapQr(row as QrRow) : null;
    });
  }

  async issue(
    command: IssueCleaningLocationQrCommand,
  ): Promise<{ record: CleaningLocationQrAccessRecord; issued: boolean }> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      // Serialize concurrent issuance for the location so the partial unique
      // index on (tenant_id, cleaning_location_id) WHERE status = 'ACTIVE'
      // is never contended.
      await tx.$queryRaw`
        SELECT id FROM cleaning_locations
        WHERE id = ${command.cleaningLocationId}::uuid
          AND tenant_id = ${command.tenantId}::uuid
        FOR UPDATE
      `;

      const existing = await tx.cleaningLocationQrAccess.findFirst({
        where: {
          tenantId: command.tenantId,
          cleaningLocationId: command.cleaningLocationId,
          status: "ACTIVE",
        },
      });

      if (existing && !command.rotate) {
        return { record: mapQr(existing as QrRow), issued: false };
      }

      if (existing) {
        const revoked = await tx.cleaningLocationQrAccess.updateMany({
          where: {
            id: existing.id,
            tenantId: command.tenantId,
            status: "ACTIVE",
          },
          data: { status: "REVOKED", revokedAt: now },
        });
        if (revoked.count !== 1) {
          throw new ConflictError(
            "Cleaning location QR rotation conflict",
            "cleaning_location_qr_rotation_conflict",
          );
        }
      }

      try {
        const created = await tx.cleaningLocationQrAccess.create({
          data: {
            id: randomUUID(),
            tenantId: command.tenantId,
            propertyId: command.propertyId,
            cleaningLocationId: command.cleaningLocationId,
            tokenHash: command.tokenHash,
            status: "ACTIVE",
            createdAt: now,
            rotatedAt: existing ? now : null,
          },
        });
        return { record: mapQr(created as QrRow), issued: true };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ConflictError(
            "Cleaning location QR already issued",
            "cleaning_location_qr_already_issued",
          );
        }
        throw error;
      }
    });
  }
}
