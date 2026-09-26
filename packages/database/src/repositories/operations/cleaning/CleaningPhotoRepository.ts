import { randomUUID } from "node:crypto";
import {
  CLEANING_PHOTO_MAX_PER_EXECUTION,
  ValidationError,
  type CleaningPhotoRecord,
  type ICleaningPhotoRepository,
  type RegisterCleaningPhotoCommand,
} from "@hcp/domain";
import { withTenantTransaction } from "../../../client";

type PhotoRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  taskId: string;
  executionId: string;
  executionItemId: string | null;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  createdAt: Date;
};

function mapPhoto(row: PhotoRow): CleaningPhotoRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    unitId: row.unitId,
    taskId: row.taskId,
    executionId: row.executionId,
    executionItemId: row.executionItemId,
    storageKey: row.storageKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt,
  };
}

export class PrismaCleaningPhotoRepository implements ICleaningPhotoRepository {
  async listByExecution(
    tenantId: string,
    executionId: string,
  ): Promise<CleaningPhotoRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.cleaningPhoto.findMany({
        where: { tenantId, executionId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => mapPhoto(row as PhotoRow));
    });
  }

  async findById(
    tenantId: string,
    photoId: string,
  ): Promise<CleaningPhotoRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.cleaningPhoto.findFirst({
        where: { id: photoId, tenantId },
      });
      return row ? mapPhoto(row as PhotoRow) : null;
    });
  }

  async register(
    command: RegisterCleaningPhotoCommand,
  ): Promise<CleaningPhotoRecord> {
    const now = command.now ?? new Date();

    return withTenantTransaction(command.tenantId, async (tx) => {
      // Lock the execution so the per-execution cap holds under concurrency.
      const locked = await tx.$queryRaw<
        Array<{ id: string; property_id: string; unit_id: string; task_id: string; status: string }>
      >`
        SELECT id, property_id, unit_id, task_id, status
        FROM cleaning_executions
        WHERE id = ${command.executionId}::uuid
          AND tenant_id = ${command.tenantId}::uuid
        FOR UPDATE
      `;
      const execution = locked[0];
      if (!execution) {
        throw new ValidationError("Cleaning execution not found");
      }
      if (execution.status !== "IN_PROGRESS") {
        throw new ValidationError("This cleaning is already completed");
      }

      const count = await tx.cleaningPhoto.count({
        where: { tenantId: command.tenantId, executionId: command.executionId },
      });
      if (count >= CLEANING_PHOTO_MAX_PER_EXECUTION) {
        throw new ValidationError(
          `A cleaning can hold at most ${CLEANING_PHOTO_MAX_PER_EXECUTION} photos`,
        );
      }

      const created = await tx.cleaningPhoto.create({
        data: {
          id: randomUUID(),
          tenantId: command.tenantId,
          propertyId: execution.property_id,
          unitId: execution.unit_id,
          taskId: execution.task_id,
          executionId: command.executionId,
          executionItemId: command.executionItemId,
          storageKey: command.storageKey,
          contentType: command.contentType,
          sizeBytes: command.sizeBytes,
          uploadedByUserId: command.uploadedByUserId,
          createdAt: now,
        },
      });
      return mapPhoto(created as PhotoRow);
    });
  }

  async remove(
    tenantId: string,
    photoId: string,
  ): Promise<CleaningPhotoRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.cleaningPhoto.findFirst({
        where: { id: photoId, tenantId },
      });
      if (!row) return null;
      const deleted = await tx.cleaningPhoto.deleteMany({
        where: { id: photoId, tenantId },
      });
      return deleted.count === 1 ? mapPhoto(row as PhotoRow) : null;
    });
  }
}

export { mapPhoto, type PhotoRow };
