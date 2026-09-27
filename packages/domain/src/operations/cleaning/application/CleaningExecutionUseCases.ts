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
import type {
  CleaningExecutionDetail,
  CleaningExecutionItemRecord,
} from "../domain/CleaningTypes";
import {
  evaluateCleaningCompletion,
  type CleaningCompletionReadiness,
} from "../domain/cleaningCompletion";
import type {
  CleaningContextSnapshot,
  CompleteCleaningResult,
  ICleaningExecutionRepository,
  PaginatedCleaningHistory,
} from "../ports/ICleaningExecutionRepository";
import type { ICleaningChecklistRepository } from "../ports/ICleaningChecklistRepository";
import type { ICleaningPhotoRepository } from "../ports/ICleaningPhotoRepository";
import {
  canPerformCleaningOnProperty,
  canReadCleaningOnProperty,
  resolveCleaningHistoryScope,
} from "./cleaningAccess";
import type { AuditIpContext } from "../../application/TaskUseCases";

export interface CleaningContextView extends CleaningContextSnapshot {
  /** Active checklist for the property (defaults ensured when missing). */
  template: {
    id: string;
    name: string;
    version: number;
    minimumCompletionPhotos: number;
    itemCount: number;
  };
  readiness: CleaningCompletionReadiness | null;
  canPerform: boolean;
}

export class ResolveCleaningContextUseCase {
  constructor(
    private readonly executions: ICleaningExecutionRepository,
    private readonly checklists: ICleaningChecklistRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; unitId?: string; locationId?: string },
    actor: ActorContext,
  ): Promise<Result<CleaningContextView, Error>> {
    try {
      if (!input.locationId && !input.unitId) {
        return Result.fail(
          new ValidationError("Provide either locationId or unitId"),
        );
      }

      const snapshot = await this.executions.resolveContext(input.tenantId, {
        locationId: input.locationId,
        unitId: input.unitId,
      });
      if (!snapshot) {
        return Result.fail(
          input.locationId
            ? new NotFoundError("Cleaning location", input.locationId)
            : new NotFoundError("Unit", input.unitId!),
        );
      }
      if (
        !canReadCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          snapshot.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const { template } = await this.checklists.ensureDefaultActiveTemplate({
        tenantId: input.tenantId,
        propertyId: snapshot.propertyId,
        actorUserId: actor.userId,
      });

      const minimumCompletionPhotos = template.minimumCompletionPhotos;
      const readiness = snapshot.activeExecution
        ? evaluateCleaningCompletion({
            items: snapshot.activeExecution.items,
            photos: snapshot.activeExecution.photos,
            minimumCompletionPhotos,
          })
        : null;

      return Result.ok({
        ...snapshot,
        template: {
          id: template.id,
          name: template.name,
          version: template.version,
          minimumCompletionPhotos: template.minimumCompletionPhotos,
          itemCount: template.items.filter((i) => i.isActive).length,
        },
        readiness,
        canPerform: canPerformCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          snapshot.propertyId,
        ),
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface StartOrResumeCleaningView {
  execution: CleaningExecutionDetail;
  created: boolean;
  taskCreated: boolean;
  taskId: string;
}

export class StartOrResumeCleaningUseCase {
  constructor(
    private readonly executions: ICleaningExecutionRepository,
    private readonly checklists: ICleaningChecklistRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; unitId?: string; locationId?: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<StartOrResumeCleaningView, Error>> {
    try {
      if (!input.locationId && !input.unitId) {
        return Result.fail(
          new ValidationError("Provide either locationId or unitId"),
        );
      }

      const snapshot = await this.executions.resolveContext(input.tenantId, {
        locationId: input.locationId,
        unitId: input.unitId,
      });
      if (!snapshot) {
        return Result.fail(
          input.locationId
            ? new NotFoundError("Cleaning location", input.locationId)
            : new NotFoundError("Unit", input.unitId!),
        );
      }
      if (
        !canPerformCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          snapshot.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (snapshot.selection.kind === "NO_WORK") {
        return Result.fail(
          new ValidationError(
            "This location is already clean — no cleaning is due",
          ),
        );
      }

      // Ensure an ACTIVE checklist exists before snapshotting into the execution.
      await this.checklists.ensureDefaultActiveTemplate({
        tenantId: input.tenantId,
        propertyId: snapshot.propertyId,
        actorUserId: actor.userId,
      });

      const result = await this.executions.startOrResume({
        tenantId: input.tenantId,
        unitId: input.unitId,
        cleaningLocationId: input.locationId ?? snapshot.locationId ?? undefined,
        actorUserId: actor.userId,
      });

      if (result.created) {
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "cleaning.started",
          resourceType: "cleaning_execution",
          resourceId: result.execution.id,
          metadata: {
            unitId: input.unitId ?? snapshot.unitId,
            locationId: snapshot.locationId,
            propertyId: snapshot.propertyId,
            taskId: result.taskId,
            taskCreated: result.taskCreated,
          },
          ipAddress: auditContext?.ipAddress ?? null,
        });
      }

      return Result.ok({
        execution: result.execution,
        created: result.created,
        taskCreated: result.taskCreated,
        taskId: result.taskId,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class UpdateCleaningChecklistItemUseCase {
  constructor(
    private readonly executions: ICleaningExecutionRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      executionId: string;
      itemId: string;
      checked: boolean;
    },
    actor: ActorContext,
  ): Promise<Result<CleaningExecutionItemRecord, Error>> {
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
          new ValidationError("This cleaning is already completed"),
        );
      }

      const item = await this.executions.updateItem({
        tenantId: input.tenantId,
        executionId: input.executionId,
        itemId: input.itemId,
        checked: input.checked,
        actorUserId: actor.userId,
      });
      return Result.ok(item);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class CompleteCleaningUseCase {
  constructor(
    private readonly executions: ICleaningExecutionRepository,
    private readonly checklists: ICleaningChecklistRepository,
    private readonly photos: ICleaningPhotoRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      executionId: string;
      expectedVersion: number;
      completionNote?: string | null;
    },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CompleteCleaningResult, Error>> {
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
          new ValidationError("This cleaning is already completed"),
        );
      }

      // Pre-flight gate for a fast, specific error. The repository re-runs the
      // same check inside the completion transaction as the authority.
      const template = await this.checklists.findActiveTemplateByProperty(
        input.tenantId,
        execution.propertyId,
      );
      const photos = await this.photos.listByExecution(
        input.tenantId,
        input.executionId,
      );
      const readiness = evaluateCleaningCompletion({
        items: execution.items,
        photos,
        minimumCompletionPhotos: template?.minimumCompletionPhotos ?? 0,
      });
      if (!readiness.ready) {
        return Result.fail(
          new ValidationError(readiness.blockers.map((b) => b.message).join("; ")),
        );
      }

      const result = await this.executions.complete({
        tenantId: input.tenantId,
        executionId: input.executionId,
        expectedVersion: input.expectedVersion,
        completionNote: input.completionNote,
        actorUserId: actor.userId,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning.completed",
        resourceType: "cleaning_execution",
        resourceId: result.execution.id,
          metadata: {
            unitId: result.execution.unitId,
            locationId: result.execution.cleaningLocationId ?? null,
            propertyId: result.execution.propertyId,
            taskId: result.task.id,
            photoCount: readiness.photoCount,
          },
        ipAddress: auditContext?.ipAddress ?? null,
      });
      if (result.housekeeping) {
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "housekeeping.marked_clean",
          resourceType: "unit_housekeeping_status",
          resourceId: result.housekeeping.unitId,
          metadata: {
            source: "TASK_COMPLETE",
            taskId: result.task.id,
            executionId: result.execution.id,
          },
          ipAddress: auditContext?.ipAddress ?? null,
        });
      }

      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListCleaningHistoryUseCase {
  constructor(
    private readonly executions: ICleaningExecutionRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId?: string | null;
      unitId?: string | null;
      cleaningLocationId?: string | null;
      entireTenant?: boolean;
      page?: number;
      limit?: number;
    },
    actor: ActorContext,
  ): Promise<Result<PaginatedCleaningHistory, Error>> {
    try {
      const scope = resolveCleaningHistoryScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        { propertyId: input.propertyId, entireTenant: input.entireTenant },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const page = await this.executions.listHistory({
        tenantId: input.tenantId,
        propertyId: scope.propertyId,
        allowedPropertyIds: scope.allowedPropertyIds,
        unitId: input.unitId,
        cleaningLocationId: input.cleaningLocationId,
        page: input.page,
        limit: input.limit,
      });
      return Result.ok(page);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
