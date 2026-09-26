import {
  ConflictError,
  Task,
  type ITaskRepository,
  type PaginatedTasks,
  type TaskListFilters,
  type TaskProps,
  type TaskCategory,
  type TaskPriority,
  type TaskSource,
  type TaskStatus,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";

type TaskRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string | null;
  bookingId: string | null;
  guestId: string | null;
  category: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedToUserId: string | null;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completionNote: string | null;
  source: string;
  sourceKey: string | null;
  version: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapTask(row: TaskRow): Task {
  const props: TaskProps = {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    unitId: row.unitId,
    bookingId: row.bookingId,
    guestId: row.guestId,
    category: row.category as TaskCategory,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assignedToUserId: row.assignedToUserId,
    dueAt: row.dueAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    completionNote: row.completionNote,
    source: row.source as TaskSource,
    sourceKey: row.sourceKey,
    version: row.version,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return Task.reconstitute(props);
}

function toCreateData(task: Task) {
  const p = task.toProps();
  return {
    id: p.id,
    tenantId: p.tenantId,
    propertyId: p.propertyId,
    unitId: p.unitId,
    bookingId: p.bookingId,
    guestId: p.guestId,
    category: p.category,
    title: p.title,
    description: p.description,
    status: p.status,
    priority: p.priority,
    assignedToUserId: p.assignedToUserId,
    dueAt: p.dueAt,
    startedAt: p.startedAt,
    completedAt: p.completedAt,
    completionNote: p.completionNote,
    source: p.source,
    sourceKey: p.sourceKey,
    version: p.version,
    createdByUserId: p.createdByUserId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toUpdateData(task: Task) {
  const p = task.toProps();
  return {
    propertyId: p.propertyId,
    unitId: p.unitId,
    bookingId: p.bookingId,
    guestId: p.guestId,
    category: p.category,
    title: p.title,
    description: p.description,
    status: p.status,
    priority: p.priority,
    assignedToUserId: p.assignedToUserId,
    dueAt: p.dueAt,
    startedAt: p.startedAt,
    completedAt: p.completedAt,
    completionNote: p.completionNote,
    source: p.source,
    sourceKey: p.sourceKey,
    version: p.version,
    updatedAt: p.updatedAt,
  };
}

export class PrismaTaskRepository implements ITaskRepository {
  async save(task: Task): Promise<void> {
    await withTenantTransaction(task.tenantId, async (tx) => {
      await tx.task.upsert({
        where: { id: task.id },
        create: toCreateData(task),
        update: toUpdateData(task),
      });
    });
  }

  async saveWithExpectedVersion(
    task: Task,
    expectedVersion: number,
  ): Promise<void> {
    await withTenantTransaction(task.tenantId, async (tx) => {
      const result = await tx.task.updateMany({
        where: { id: task.id, tenantId: task.tenantId, version: expectedVersion },
        data: toUpdateData(task),
      });
      if (result.count !== 1) {
        throw new ConflictError("Task version conflict", "task_version_conflict");
      }
    });
  }

  async findById(tenantId: string, taskId: string): Promise<Task | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.task.findFirst({
        where: { id: taskId, tenantId },
      });
      return row ? mapTask(row as TaskRow) : null;
    });
  }

  async findBySourceKey(
    tenantId: string,
    sourceKey: string,
  ): Promise<Task | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.task.findFirst({
        where: { tenantId, sourceKey },
      });
      return row ? mapTask(row as TaskRow) : null;
    });
  }

  async list(filters: TaskListFilters): Promise<PaginatedTasks> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    return withTenantTransaction(filters.tenantId, async (tx) => {
      const where: Record<string, unknown> = {
        tenantId: filters.tenantId,
      };

      if (filters.allowedPropertyIds !== null && filters.allowedPropertyIds !== undefined) {
        if (filters.allowedPropertyIds.length === 0) {
          return { data: [], page, limit, total: 0 };
        }
        where.propertyId = { in: filters.allowedPropertyIds };
      }
      if (filters.propertyId) {
        where.propertyId = filters.propertyId;
      }
      if (filters.status) {
        where.status = Array.isArray(filters.status)
          ? { in: filters.status }
          : filters.status;
      }
      if (filters.category) {
        where.category = Array.isArray(filters.category)
          ? { in: filters.category }
          : filters.category;
      }
      if (filters.unitId) where.unitId = filters.unitId;
      if (filters.assignedToUserId) {
        where.assignedToUserId = filters.assignedToUserId;
      }
      if (filters.priority) {
        where.priority = Array.isArray(filters.priority)
          ? { in: filters.priority }
          : filters.priority;
      }
      if (filters.bookingId) where.bookingId = filters.bookingId;
      if (filters.dueFrom || filters.dueTo) {
        where.dueAt = {
          ...(filters.dueFrom ? { gte: filters.dueFrom } : {}),
          ...(filters.dueTo ? { lte: filters.dueTo } : {}),
        };
      }

      const [total, rows] = await Promise.all([
        tx.task.count({ where }),
        tx.task.findMany({
          where,
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          skip,
          take: limit,
        }),
      ]);

      return {
        data: rows.map((r) => mapTask(r as TaskRow)),
        page,
        limit,
        total,
      };
    });
  }
}

export { mapTask, type TaskRow };
