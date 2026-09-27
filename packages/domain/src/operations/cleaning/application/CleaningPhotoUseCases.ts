import { Result } from "../../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../../shared/services/PermissionChecker";
import type { IAuditLogRepository } from "../../../shared/ports/InfrastructurePorts";
import type { IIdGenerator } from "../../../shared/ports/IIdGenerator";
import {
  CLEANING_PHOTO_MAX_BYTES,
  CLEANING_PHOTO_MAX_PER_EXECUTION,
  isCleaningPhotoContentType,
  type CleaningPhotoRecord,
} from "../domain/CleaningTypes";
import type { ICleaningExecutionRepository } from "../ports/ICleaningExecutionRepository";
import type { ICleaningPhotoRepository } from "../ports/ICleaningPhotoRepository";
import {
  buildCleaningPhotoStorageKey,
  type ICleaningObjectStorage,
} from "../ports/ICleaningObjectStorage";
import { canPerformCleaningOnProperty } from "./cleaningAccess";
import type { AuditIpContext } from "../../application/TaskUseCases";

export interface CleaningPhotoView extends CleaningPhotoRecord {
  /** Short-lived signed URL; regenerated on every read. */
  url: string | null;
}

export class RegisterCleaningPhotoUseCase {
  constructor(
    private readonly executions: ICleaningExecutionRepository,
    private readonly photos: ICleaningPhotoRepository,
    private readonly storage: ICleaningObjectStorage,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      executionId: string;
      executionItemId?: string | null;
      contentType: string;
      body: Uint8Array;
    },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningPhotoView, Error>> {
    try {
      if (!isCleaningPhotoContentType(input.contentType)) {
        return Result.fail(
          new ValidationError("Photos must be JPEG, PNG or WebP"),
        );
      }
      if (input.body.byteLength === 0) {
        return Result.fail(new ValidationError("Photo is empty"));
      }
      if (input.body.byteLength > CLEANING_PHOTO_MAX_BYTES) {
        return Result.fail(
          new ValidationError(
            `Photo exceeds the ${Math.round(CLEANING_PHOTO_MAX_BYTES / (1024 * 1024))}MB limit`,
          ),
        );
      }

      const execution = await this.executions.findById(
        input.tenantId,
        input.executionId,
      );
      if (!execution) {
        return Result.fail(new NotFoundError("Cleaning execution", input.executionId));
      }
      if (
        !canPerformCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          execution.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (execution.status !== "IN_PROGRESS") {
        return Result.fail(
          new ValidationError("This cleaning is already completed"),
        );
      }

      const itemId = input.executionItemId?.trim() || null;
      if (itemId && !execution.items.some((item) => item.id === itemId)) {
        return Result.fail(
          new ValidationError("Checklist item does not belong to this cleaning"),
        );
      }

      const existing = await this.photos.listByExecution(
        input.tenantId,
        input.executionId,
      );
      if (existing.length >= CLEANING_PHOTO_MAX_PER_EXECUTION) {
        return Result.fail(
          new ValidationError(
            `A cleaning can hold at most ${CLEANING_PHOTO_MAX_PER_EXECUTION} photos`,
          ),
        );
      }

      const photoId = this.ids.generate();
      const storageKey = buildCleaningPhotoStorageKey({
        tenantId: input.tenantId,
        propertyId: execution.propertyId,
        unitId: execution.unitId,
        cleaningLocationId: execution.cleaningLocationId,
        executionId: execution.id,
        photoId,
        contentType: input.contentType,
      });

      await this.storage.upload({
        key: storageKey,
        contentType: input.contentType,
        body: input.body,
      });

      let record: CleaningPhotoRecord;
      try {
        record = await this.photos.register({
          tenantId: input.tenantId,
          executionId: input.executionId,
          executionItemId: itemId,
          storageKey,
          contentType: input.contentType,
          sizeBytes: input.body.byteLength,
          uploadedByUserId: actor.userId,
        });
      } catch (error) {
        // Never leave an orphan object behind when the row is rejected.
        await this.storage.delete(storageKey).catch(() => undefined);
        throw error;
      }

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning_photo.registered",
        resourceType: "cleaning_photo",
        resourceId: record.id,
        metadata: {
          executionId: record.executionId,
          executionItemId: record.executionItemId,
          sizeBytes: record.sizeBytes,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      const url = await this.storage
        .createReadUrl(record.storageKey)
        .catch(() => null);
      return Result.ok({ ...record, url });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class RemoveCleaningPhotoUseCase {
  constructor(
    private readonly executions: ICleaningExecutionRepository,
    private readonly photos: ICleaningPhotoRepository,
    private readonly storage: ICleaningObjectStorage,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; executionId: string; photoId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<{ id: string }, Error>> {
    try {
      const execution = await this.executions.findById(
        input.tenantId,
        input.executionId,
      );
      if (!execution) {
        return Result.fail(new NotFoundError("Cleaning execution", input.executionId));
      }
      if (
        !canPerformCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          execution.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (execution.status !== "IN_PROGRESS") {
        return Result.fail(
          new ValidationError("Completed cleanings keep their evidence photos"),
        );
      }

      const photo = await this.photos.findById(input.tenantId, input.photoId);
      if (!photo || photo.executionId !== input.executionId) {
        return Result.fail(new NotFoundError("Cleaning photo", input.photoId));
      }

      const removed = await this.photos.remove(input.tenantId, input.photoId);
      if (removed) {
        await this.storage.delete(removed.storageKey).catch(() => undefined);
      }

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning_photo.removed",
        resourceType: "cleaning_photo",
        resourceId: input.photoId,
        metadata: { executionId: input.executionId },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok({ id: input.photoId });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Attaches fresh signed URLs to persisted photo rows. */
export async function withCleaningPhotoUrls(
  storage: ICleaningObjectStorage,
  photos: readonly CleaningPhotoRecord[],
): Promise<CleaningPhotoView[]> {
  return Promise.all(
    photos.map(async (photo) => ({
      ...photo,
      url: await storage.createReadUrl(photo.storageKey).catch(() => null),
    })),
  );
}
