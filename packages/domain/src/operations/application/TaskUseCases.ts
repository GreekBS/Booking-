import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { IMembershipRepository } from "../../identity/ports/IdentityRepositories";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import { Task } from "../domain/Task";
import type { TaskCategory, TaskPriority } from "../domain/TaskTypes";
import type { ITaskRepository } from "../ports/ITaskRepository";
import type { IUnitHousekeepingStatusRepository } from "../ports/IUnitHousekeepingStatusRepository";
import type { IHousekeepingTurnoverStore } from "../ports/IHousekeepingTurnoverStore";
import {
  canAssignOnProperty,
  canCreateTaskOnProperty,
  canUpdateHousekeepingOnProperty,
  canUpdateTaskOnProperty,
  resolveTaskListScope,
} from "./taskAccess";

export interface AuditIpContext {
  ipAddress?: string | null;
}

async function assertAssignee(
  memberships: IMembershipRepository,
  tenantId: string,
  propertyId: string,
  assignedToUserId: string | null,
): Promise<void> {
  if (!assignedToUserId) return;
  const membership = await memberships.findByUserAndTenant(
    assignedToUserId,
    tenantId,
  );
  if (!membership || !membership.isActive) {
    throw new ValidationError("Assignee must be an active tenant member");
  }
  if (
    membership.propertyIds !== null &&
    !membership.propertyIds.includes(propertyId)
  ) {
    throw new ValidationError("Assignee is not authorized for this property");
  }
}

export class CreateTaskUseCase {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly properties: IPropertyRepository,
    private readonly memberships: IMembershipRepository,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId: string;
      unitId?: string | null;
      bookingId?: string | null;
      guestId?: string | null;
      category: TaskCategory;
      title: string;
      description?: string | null;
      priority?: TaskPriority;
      assignedToUserId?: string | null;
      dueAt?: Date | null;
    },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<Task, Error>> {
    try {
      if (
        !canCreateTaskOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const property = await this.properties.findById(
        input.tenantId,
        input.propertyId,
      );
      if (!property) {
        return Result.fail(new ValidationError("Property not found"));
      }

      if (input.unitId) {
        const unit = property.units.find((u) => u.id === input.unitId);
        if (!unit || unit.deletedAt) {
          return Result.fail(new ValidationError("Unit not found on property"));
        }
      }

      await assertAssignee(
        this.memberships,
        input.tenantId,
        input.propertyId,
        input.assignedToUserId ?? null,
      );

      const task = Task.create({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        unitId: input.unitId,
        bookingId: input.bookingId,
        guestId: input.guestId,
        category: input.category,
        title: input.title,
        description: input.description,
        priority: input.priority,
        assignedToUserId: input.assignedToUserId,
        dueAt: input.dueAt,
        source: "MANUAL",
        createdByUserId: actor.userId,
      });

      await this.tasks.save(task);

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "task.created",
        resourceType: "task",
        resourceId: task.id,
        metadata: {
          category: task.category,
          propertyId: task.propertyId,
          unitId: task.unitId,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(task);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetTaskUseCase {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; taskId: string },
    actor: ActorContext,
  ): Promise<Result<Task, Error>> {
    try {
      const task = await this.tasks.findById(input.tenantId, input.taskId);
      if (!task) {
        return Result.fail(new NotFoundError("Task", input.taskId));
      }
      const scope = resolveTaskListScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        { propertyId: task.propertyId },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }
      return Result.ok(task);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListTasksUseCase {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId?: string | null;
      entireTenant?: boolean;
      status?: string | string[];
      category?: string | string[];
      unitId?: string | null;
      assignedToUserId?: string | null;
      priority?: string | string[];
      bookingId?: string | null;
      dueFrom?: Date | null;
      dueTo?: Date | null;
      page?: number;
      limit?: number;
    },
    actor: ActorContext,
  ): Promise<Result<Awaited<ReturnType<ITaskRepository["list"]>>, Error>> {
    try {
      const scope = resolveTaskListScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        {
          propertyId: input.propertyId,
          entireTenant: input.entireTenant,
        },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const page = await this.tasks.list({
        tenantId: input.tenantId,
        propertyId: scope.propertyId,
        allowedPropertyIds: scope.allowedPropertyIds,
        status: input.status as never,
        category: input.category as never,
        unitId: input.unitId,
        assignedToUserId: input.assignedToUserId,
        priority: input.priority as never,
        bookingId: input.bookingId,
        dueFrom: input.dueFrom,
        dueTo: input.dueTo,
        page: input.page,
        limit: input.limit,
      });
      return Result.ok(page);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

async function loadMutableTask(
  tasks: ITaskRepository,
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  taskId: string,
): Promise<Task> {
  const task = await tasks.findById(tenantId, taskId);
  if (!task) {
    throw new NotFoundError("Task", taskId);
  }
  if (!canUpdateTaskOnProperty(permissionChecker, actor, tenantId, task.propertyId)) {
    throw new ForbiddenError();
  }
  return task;
}

export class StartTaskUseCase {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; taskId: string; expectedVersion: number },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<Task, Error>> {
    try {
      const task = await loadMutableTask(
        this.tasks,
        this.permissionChecker,
        actor,
        input.tenantId,
        input.taskId,
      );
      const expected = input.expectedVersion;
      task.start(expected);
      await this.tasks.saveWithExpectedVersion(task, expected);
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "task.started",
        resourceType: "task",
        resourceId: task.id,
        metadata: { version: task.version },
        ipAddress: auditContext?.ipAddress ?? null,
      });
      return Result.ok(task);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class UnstartTaskUseCase {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; taskId: string; expectedVersion: number },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<Task, Error>> {
    try {
      const task = await loadMutableTask(
        this.tasks,
        this.permissionChecker,
        actor,
        input.tenantId,
        input.taskId,
      );
      const expected = input.expectedVersion;
      task.unstart(expected);
      await this.tasks.saveWithExpectedVersion(task, expected);
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "task.unstarted",
        resourceType: "task",
        resourceId: task.id,
        metadata: { version: task.version },
        ipAddress: auditContext?.ipAddress ?? null,
      });
      return Result.ok(task);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class CompleteTaskUseCase {
  constructor(
    private readonly turnoverStore: IHousekeepingTurnoverStore,
    private readonly tasks: ITaskRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      taskId: string;
      expectedVersion: number;
      completionNote?: string | null;
    },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<Task, Error>> {
    try {
      const existing = await loadMutableTask(
        this.tasks,
        this.permissionChecker,
        actor,
        input.tenantId,
        input.taskId,
      );

      if (existing.category === "HOUSEKEEPING" && existing.unitId) {
        const result = await this.turnoverStore.completeHousekeepingTask({
          tenantId: input.tenantId,
          taskId: input.taskId,
          expectedVersion: input.expectedVersion,
          completionNote: input.completionNote,
          actorUserId: actor.userId,
        });
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "task.completed",
          resourceType: "task",
          resourceId: result.task.id,
          metadata: {
            version: result.task.version,
            unitCleaned: result.housekeeping?.unitId ?? null,
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
            metadata: { source: "TASK_COMPLETE", taskId: result.task.id },
            ipAddress: auditContext?.ipAddress ?? null,
          });
        }
        return Result.ok(result.task);
      }

      const expected = input.expectedVersion;
      existing.complete(expected, input.completionNote);
      await this.tasks.saveWithExpectedVersion(existing, expected);
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "task.completed",
        resourceType: "task",
        resourceId: existing.id,
        metadata: { version: existing.version },
        ipAddress: auditContext?.ipAddress ?? null,
      });
      return Result.ok(existing);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class CancelTaskUseCase {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; taskId: string; expectedVersion: number },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<Task, Error>> {
    try {
      const task = await loadMutableTask(
        this.tasks,
        this.permissionChecker,
        actor,
        input.tenantId,
        input.taskId,
      );
      const expected = input.expectedVersion;
      task.cancel(expected);
      await this.tasks.saveWithExpectedVersion(task, expected);
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "task.cancelled",
        resourceType: "task",
        resourceId: task.id,
        metadata: { version: task.version },
        ipAddress: auditContext?.ipAddress ?? null,
      });
      return Result.ok(task);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ReopenTaskUseCase {
  constructor(
    private readonly turnoverStore: IHousekeepingTurnoverStore,
    private readonly tasks: ITaskRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; taskId: string; expectedVersion: number },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<Task, Error>> {
    try {
      const existing = await loadMutableTask(
        this.tasks,
        this.permissionChecker,
        actor,
        input.tenantId,
        input.taskId,
      );

      if (existing.category === "HOUSEKEEPING" && existing.unitId) {
        const result = await this.turnoverStore.reopenHousekeepingTask({
          tenantId: input.tenantId,
          taskId: input.taskId,
          expectedVersion: input.expectedVersion,
          actorUserId: actor.userId,
        });
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "task.reopened",
          resourceType: "task",
          resourceId: result.task.id,
          metadata: { version: result.task.version },
          ipAddress: auditContext?.ipAddress ?? null,
        });
        if (result.housekeeping) {
          await this.audit?.append({
            tenantId: input.tenantId,
            actorId: actor.userId,
            action: "housekeeping.marked_dirty",
            resourceType: "unit_housekeeping_status",
            resourceId: result.housekeeping.unitId,
            metadata: { source: "TASK_REOPEN", taskId: result.task.id },
            ipAddress: auditContext?.ipAddress ?? null,
          });
        }
        return Result.ok(result.task);
      }

      const expected = input.expectedVersion;
      existing.reopen(expected);
      await this.tasks.saveWithExpectedVersion(existing, expected);
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "task.reopened",
        resourceType: "task",
        resourceId: existing.id,
        metadata: { version: existing.version },
        ipAddress: auditContext?.ipAddress ?? null,
      });
      return Result.ok(existing);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class AssignTaskUseCase {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly memberships: IMembershipRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      taskId: string;
      expectedVersion: number;
      assignedToUserId: string | null;
    },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<Task, Error>> {
    try {
      const task = await this.tasks.findById(input.tenantId, input.taskId);
      if (!task) {
        return Result.fail(new NotFoundError("Task", input.taskId));
      }
      if (
        !canAssignOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          task.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      await assertAssignee(
        this.memberships,
        input.tenantId,
        task.propertyId,
        input.assignedToUserId,
      );
      const expected = input.expectedVersion;
      const previous = task.assignedToUserId;
      task.assign(expected, input.assignedToUserId);
      await this.tasks.saveWithExpectedVersion(task, expected);
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "task.assigned",
        resourceType: "task",
        resourceId: task.id,
        metadata: {
          previousAssignedToUserId: previous,
          assignedToUserId: task.assignedToUserId,
          version: task.version,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });
      return Result.ok(task);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class MarkUnitDirtyUseCase {
  constructor(
    private readonly housekeeping: IUnitHousekeepingStatusRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      unitId: string;
      propertyId: string;
      expectedVersion?: number;
    },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<import("../domain/UnitHousekeepingStatus").UnitHousekeepingStatus, Error>> {
    try {
      if (
        !canUpdateHousekeepingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const property = await this.properties.findById(
        input.tenantId,
        input.propertyId,
      );
      if (!property?.units.some((u) => u.id === input.unitId && !u.deletedAt)) {
        return Result.fail(new ValidationError("Unit not found"));
      }

      const status = await this.housekeeping.ensureInitialized({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        unitId: input.unitId,
      });
      const expected = input.expectedVersion ?? status.version;
      const changed = status.markDirty(expected, "MANUAL", actor.userId);
      if (changed) {
        await this.housekeeping.saveWithExpectedVersion(status, expected);
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "housekeeping.marked_dirty",
          resourceType: "unit_housekeeping_status",
          resourceId: status.unitId,
          metadata: { source: "MANUAL", version: status.version },
          ipAddress: auditContext?.ipAddress ?? null,
        });
      }
      return Result.ok(status);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class MarkUnitCleanUseCase {
  constructor(
    private readonly housekeeping: IUnitHousekeepingStatusRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      unitId: string;
      propertyId: string;
      expectedVersion?: number;
    },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<import("../domain/UnitHousekeepingStatus").UnitHousekeepingStatus, Error>> {
    try {
      if (
        !canUpdateHousekeepingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const property = await this.properties.findById(
        input.tenantId,
        input.propertyId,
      );
      if (!property?.units.some((u) => u.id === input.unitId && !u.deletedAt)) {
        return Result.fail(new ValidationError("Unit not found"));
      }

      const status = await this.housekeeping.ensureInitialized({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        unitId: input.unitId,
      });
      const expected = input.expectedVersion ?? status.version;
      const changed = status.markClean(expected, "MANUAL", actor.userId);
      if (changed) {
        await this.housekeeping.saveWithExpectedVersion(status, expected);
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "housekeeping.marked_clean",
          resourceType: "unit_housekeeping_status",
          resourceId: status.unitId,
          metadata: { source: "MANUAL", version: status.version },
          ipAddress: auditContext?.ipAddress ?? null,
        });
      }
      return Result.ok(status);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetUnitHousekeepingStatusUseCase {
  constructor(
    private readonly housekeeping: IUnitHousekeepingStatusRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; propertyId: string; unitId: string },
    actor: ActorContext,
  ): Promise<Result<import("../domain/UnitHousekeepingStatus").UnitHousekeepingStatus, Error>> {
    try {
      const scope = resolveTaskListScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        { propertyId: input.propertyId },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const property = await this.properties.findById(
        input.tenantId,
        input.propertyId,
      );
      if (!property?.units.some((u) => u.id === input.unitId && !u.deletedAt)) {
        return Result.fail(new NotFoundError("Unit", input.unitId));
      }

      const status = await this.housekeeping.ensureInitialized({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        unitId: input.unitId,
      });
      return Result.ok(status);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
