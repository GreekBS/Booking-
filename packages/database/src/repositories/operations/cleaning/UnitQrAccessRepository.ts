import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  ConflictError,
  type IUnitQrAccessRepository,
  type IssueUnitQrCommand,
  type UnitQrAccessRecord,
  type UnitQrStatus,
} from "@hcp/domain";
import { withTenantTransaction } from "../../../client";

type QrRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  tokenHash: string;
  status: string;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
};

function mapQr(row: QrRow): UnitQrAccessRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    unitId: row.unitId,
    // CHAR(64) is space padded on read for shorter values; normalize defensively.
    tokenHash: row.tokenHash.trim(),
    status: row.status as UnitQrStatus,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
    revokedAt: row.revokedAt,
  };
}

export class PrismaUnitQrAccessRepository implements IUnitQrAccessRepository {
  async findActiveByUnit(
    tenantId: string,
    unitId: string,
  ): Promise<UnitQrAccessRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.unitQrAccess.findFirst({
        where: { tenantId, unitId, status: "ACTIVE" },
      });
      return row ? mapQr(row as QrRow) : null;
    });
  }

  async findActiveByTokenHash(
    tenantId: string,
    tokenHash: string,
  ): Promise<UnitQrAccessRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.unitQrAccess.findFirst({
        where: { tenantId, tokenHash, status: "ACTIVE" },
      });
      return row ? mapQr(row as QrRow) : null;
    });
  }

  async issue(
    command: IssueUnitQrCommand,
  ): Promise<{ record: UnitQrAccessRecord; issued: boolean }> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      // Serialize concurrent issuance for the unit so the partial unique index
      // on (tenant_id, unit_id) WHERE status = 'ACTIVE' is never contended.
      await tx.$queryRaw`
        SELECT id FROM units
        WHERE id = ${command.unitId}::uuid AND tenant_id = ${command.tenantId}::uuid
        FOR UPDATE
      `;

      const existing = await tx.unitQrAccess.findFirst({
        where: {
          tenantId: command.tenantId,
          unitId: command.unitId,
          status: "ACTIVE",
        },
      });

      if (existing && !command.rotate) {
        return { record: mapQr(existing as QrRow), issued: false };
      }

      if (existing) {
        const revoked = await tx.unitQrAccess.updateMany({
          where: { id: existing.id, tenantId: command.tenantId, status: "ACTIVE" },
          data: { status: "REVOKED", revokedAt: now },
        });
        if (revoked.count !== 1) {
          throw new ConflictError(
            "Unit QR rotation conflict",
            "unit_qr_rotation_conflict",
          );
        }
      }

      try {
        const created = await tx.unitQrAccess.create({
          data: {
            id: randomUUID(),
            tenantId: command.tenantId,
            propertyId: command.propertyId,
            unitId: command.unitId,
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
            "Unit QR already issued",
            "unit_qr_already_issued",
          );
        }
        throw error;
      }
    });
  }
}
