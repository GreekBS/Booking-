import type { Task, TaskProps } from "../domain/Task";
import type { TaskCategory, TaskPriority, TaskStatus } from "../domain/TaskTypes";

export interface TaskListFilters {
  tenantId: string;
  propertyId?: string | null;
  /** Manager ACL: null = tenant-wide; array = restrict. */
  allowedPropertyIds?: string[] | null;
  status?: TaskStatus | TaskStatus[];
  category?: TaskCategory | TaskCategory[];
  unitId?: string | null;
  assignedToUserId?: string | null;
  priority?: TaskPriority | TaskPriority[];
  bookingId?: string | null;
  dueFrom?: Date | null;
  dueTo?: Date | null;
  page?: number;
  limit?: number;
}

export interface PaginatedTasks {
  data: Task[];
  page: number;
  limit: number;
  total: number;
}

export interface ITaskRepository {
  save(task: Task): Promise<void>;
  /**
   * Conditional save: WHERE id AND version = expectedVersion (pre-bump version).
   * Throws ConflictError on stale version.
   */
  saveWithExpectedVersion(task: Task, expectedVersion: number): Promise<void>;
  findById(tenantId: string, taskId: string): Promise<Task | null>;
  findBySourceKey(tenantId: string, sourceKey: string): Promise<Task | null>;
  list(filters: TaskListFilters): Promise<PaginatedTasks>;
}

export type { TaskProps };
