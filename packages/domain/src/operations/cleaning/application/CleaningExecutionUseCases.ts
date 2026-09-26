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
  /** Active checklist for the property, resolved for display before start. */
  template: {
    id: string;
    name: string;
    version: number;
    minimumCompletionPhotos: number;
    itemCount: number;
  } | null;
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
    input: { tenantId: string; unitId: string },
    actor: ActorContext,
  ): Promise<Result<CleaningContextView, Error>> {
    try {
      const snapshot = await this.executions.resolveContext(
        input.tenantId,
        input.unitId,
      );
      if (!snapshot) {
        return Result.fail(new NotFoundError("Unit", input.unitId));
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

      const template = await this.checklists.findActiveTemplateByProperty(
        input.tenantId,
        snapshot.propertyId,
      );

      const minimumCompletionPhotos = template?.minimumCompletionPhotos ?? 0;
      const readiness = snapshot.activeExecution
        ? evaluateCleaningCompletion({
            items: snapshot.activeExecution.items,
            photos: snapshot.activeExecution.photos,
            minimumCompletionPhotos,
          })
        : null;

      return Result.ok({
        ...snapshot,
        template: template
          ? {
              id: template.id,
              name: template.name,
              version: template.version,
              minimumCompletionPhotos: template.minimumCompletionPhotos,
              itemCount: template.items.filter((i) => i.isActive).length,
            }
          : null,
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
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; unitId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<StartOrResumeCleaningView, Error>> {
    try {
      const snapshot = await this.executions.resolveContext(
        input.tenantId,
        input.unitId,
      );
      if (!snapshot) {
        return Result.fail(new NotFoundError("Unit", input.unitId));
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
          new ValidationError("This unit is already clean — no cleaning is due"),
        );
      }

      const result = await this.executions.startOrResume({
        tenantId: input.tenantId,
        unitId: input.unitId,
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
            unitId: input.unitId,
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
        page: input.page,
        limit: input.limit,
      });
      return Result.ok(page);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
