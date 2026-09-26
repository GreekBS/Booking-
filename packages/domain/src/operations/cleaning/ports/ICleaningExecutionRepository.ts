import type { Task } from "../../domain/Task";
import type { UnitHousekeepingStatus } from "../../domain/UnitHousekeepingStatus";
import type {
  CleaningExecutionDetail,
  CleaningExecutionItemRecord,
  CleaningExecutionRecord,
} from "../domain/CleaningTypes";
import type { CleaningTaskSelection } from "../domain/cleaningTaskPolicy";

/** Everything the QR screen needs to render before any write happens. */
export interface CleaningContextSnapshot {
  tenantId: string;
  propertyId: string;
  propertyName: string;
  propertyTimezone: string;
  unitId: string;
  unitName: string;
  housekeepingStatus: "CLEAN" | "DIRTY";
  housekeepingVersion: number;
  selection: CleaningTaskSelection;
  /** Set when `selection.kind === "EXISTING"`. */
  task: {
    id: string;
    title: string;
    status: string;
    source: string;
    dueAt: Date | null;
    version: number;
  } | null;
  activeExecution: CleaningExecutionDetail | null;
}

export interface StartOrResumeCleaningCommand {
  tenantId: string;
  unitId: string;
  actorUserId: string;
  now?: Date;
}

export interface StartOrResumeCleaningResult {
  execution: CleaningExecutionDetail;
  /** False when an IN_PROGRESS execution was resumed. */
  created: boolean;
  /** True when the policy opened a new MANUAL housekeeping task. */
  taskCreated: boolean;
  taskId: string;
}

export interface UpdateCleaningItemCommand {
  tenantId: string;
  executionId: string;
  itemId: string;
  checked: boolean;
  actorUserId: string;
  now?: Date;
}

export interface CompleteCleaningCommand {
  tenantId: string;
  executionId: string;
  expectedVersion: number;
  completionNote?: string | null;
  actorUserId: string;
  now?: Date;
}

export interface CompleteCleaningResult {
  execution: CleaningExecutionDetail;
  task: Task;
  housekeeping: UnitHousekeepingStatus | null;
}

export interface ListCleaningHistoryFilters {
  tenantId: string;
  unitId?: string | null;
  propertyId?: string | null;
  /** Manager ACL: null = tenant-wide; array = restrict. */
  allowedPropertyIds?: string[] | null;
  page?: number;
  limit?: number;
}

export interface CleaningHistoryEntry extends CleaningExecutionRecord {
  unitName: string;
  propertyName: string;
  taskTitle: string;
  itemsTotal: number;
  itemsChecked: number;
  photoCount: number;
}

export interface PaginatedCleaningHistory {
  data: CleaningHistoryEntry[];
  page: number;
  limit: number;
  total: number;
}

export interface ICleaningExecutionRepository {
  findById(
    tenantId: string,
    executionId: string,
  ): Promise<CleaningExecutionDetail | null>;

  /** Context read for the QR screen — no writes, no task creation. */
  resolveContext(
    tenantId: string,
    unitId: string,
  ): Promise<CleaningContextSnapshot | null>;

  /**
   * Applies the task selection policy and returns the IN_PROGRESS execution
   * for the selected task, creating task/execution/item snapshot as needed.
   * Atomic.
   */
  startOrResume(
    command: StartOrResumeCleaningCommand,
  ): Promise<StartOrResumeCleaningResult>;

  updateItem(
    command: UpdateCleaningItemCommand,
  ): Promise<CleaningExecutionItemRecord>;

  /**
   * Single transaction: re-validate the completion gate, mark the execution
   * COMPLETED, and complete the linked housekeeping task so the Unit becomes
   * CLEAN. Either all of it lands or none of it does.
   */
  complete(command: CompleteCleaningCommand): Promise<CompleteCleaningResult>;

  listHistory(
    filters: ListCleaningHistoryFilters,
  ): Promise<PaginatedCleaningHistory>;
}
