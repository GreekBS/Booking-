import { AggregateRoot } from "../../shared/kernel/Entity";
import {
  ConflictError,
  ValidationError,
} from "../../shared/errors/DomainError";
import { TaskStateMachine } from "./TaskStateMachine";
import type {
  TaskCategory,
  TaskPriority,
  TaskSource,
  TaskStatus,
} from "./TaskTypes";

export interface TaskProps {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string | null;
  bookingId: string | null;
  guestId: string | null;
  category: TaskCategory;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToUserId: string | null;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completionNote: string | null;
  source: TaskSource;
  sourceKey: string | null;
  version: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  id: string;
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
  source?: TaskSource;
  sourceKey?: string | null;
  createdByUserId?: string | null;
  now?: Date;
}

export class Task extends AggregateRoot<TaskProps> {
  private constructor(props: TaskProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get propertyId(): string {
    return this.props.propertyId;
  }
  get unitId(): string | null {
    return this.props.unitId;
  }
  get bookingId(): string | null {
    return this.props.bookingId;
  }
  get guestId(): string | null {
    return this.props.guestId;
  }
  get category(): TaskCategory {
    return this.props.category;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
  }
  get status(): TaskStatus {
    return this.props.status;
  }
  get priority(): TaskPriority {
    return this.props.priority;
  }
  get assignedToUserId(): string | null {
    return this.props.assignedToUserId;
  }
  get dueAt(): Date | null {
    return this.props.dueAt;
  }
  get startedAt(): Date | null {
    return this.props.startedAt;
  }
  get completedAt(): Date | null {
    return this.props.completedAt;
  }
  get completionNote(): string | null {
    return this.props.completionNote;
  }
  get source(): TaskSource {
    return this.props.source;
  }
  get sourceKey(): string | null {
    return this.props.sourceKey;
  }
  get version(): number {
    return this.props.version;
  }
  get createdByUserId(): string | null {
    return this.props.createdByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Snapshot of props for persistence (immutable copy). */
  toProps(): TaskProps {
    return { ...this.props };
  }

  static create(input: CreateTaskInput): Task {
    const now = input.now ?? new Date();
    const title = input.title.trim();
    if (!title) {
      throw new ValidationError("Task title is required");
    }
    if (title.length > 255) {
      throw new ValidationError("Task title too long");
    }
    if (input.sourceKey && input.source !== "TURNOVER" && input.source !== "SYSTEM") {
      throw new ValidationError("sourceKey is only valid for TURNOVER or SYSTEM tasks");
    }

    return new Task({
      id: input.id,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      unitId: input.unitId ?? null,
      bookingId: input.bookingId ?? null,
      guestId: input.guestId ?? null,
      category: input.category,
      title,
      description: input.description?.trim() || null,
      status: "OPEN",
      priority: input.priority ?? "NORMAL",
      assignedToUserId: input.assignedToUserId ?? null,
      dueAt: input.dueAt ?? null,
      startedAt: null,
      completedAt: null,
      completionNote: null,
      source: input.source ?? "MANUAL",
      sourceKey: input.sourceKey ?? null,
      version: 1,
      createdByUserId: input.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: TaskProps): Task {
    return new Task(props);
  }

  assertExpectedVersion(expectedVersion: number): void {
    if (this.props.version !== expectedVersion) {
      throw new ConflictError("Task version conflict", "task_version_conflict");
    }
  }

  private bump(at: Date): void {
    this.props.version += 1;
    this.props.updatedAt = at;
  }

  start(expectedVersion: number, at: Date = new Date()): void {
    this.assertExpectedVersion(expectedVersion);
    TaskStateMachine.assertCanTransition(this.props.status, "IN_PROGRESS");
    this.props.status = "IN_PROGRESS";
    this.props.startedAt = at;
    this.bump(at);
  }

  unstart(expectedVersion: number, at: Date = new Date()): void {
    this.assertExpectedVersion(expectedVersion);
    TaskStateMachine.assertCanTransition(this.props.status, "OPEN");
    if (this.props.status !== "IN_PROGRESS") {
      throw new ConflictError("Only IN_PROGRESS tasks can be unstarted");
    }
    this.props.status = "OPEN";
    this.props.startedAt = null;
    this.bump(at);
  }

  complete(
    expectedVersion: number,
    completionNote?: string | null,
    at: Date = new Date(),
  ): void {
    this.assertExpectedVersion(expectedVersion);
    TaskStateMachine.assertCanTransition(this.props.status, "COMPLETED");
    this.props.status = "COMPLETED";
    this.props.completedAt = at;
    this.props.completionNote = completionNote?.trim() || null;
    this.bump(at);
  }

  cancel(expectedVersion: number, at: Date = new Date()): void {
    this.assertExpectedVersion(expectedVersion);
    TaskStateMachine.assertCanTransition(this.props.status, "CANCELLED");
    this.props.status = "CANCELLED";
    this.bump(at);
  }

  reopen(expectedVersion: number, at: Date = new Date()): void {
    this.assertExpectedVersion(expectedVersion);
    TaskStateMachine.assertCanTransition(this.props.status, "OPEN");
    if (this.props.status !== "COMPLETED") {
      throw new ConflictError("Only COMPLETED tasks can be reopened");
    }
    this.props.status = "OPEN";
    this.props.completedAt = null;
    this.props.completionNote = null;
    this.props.startedAt = null;
    this.bump(at);
  }

  assign(
    expectedVersion: number,
    assignedToUserId: string | null,
    at: Date = new Date(),
  ): void {
    this.assertExpectedVersion(expectedVersion);
    if (this.props.status === "CANCELLED" || this.props.status === "COMPLETED") {
      throw new ConflictError("Cannot assign a terminal task");
    }
    this.props.assignedToUserId = assignedToUserId;
    this.bump(at);
  }

  /** System reconciliation: update location/due for OPEN turnover tasks. */
  reconcileOpenTurnover(
    expectedVersion: number,
    patch: {
      propertyId: string;
      unitId: string;
      dueAt: Date;
      guestId?: string | null;
    },
    at: Date = new Date(),
  ): void {
    this.assertExpectedVersion(expectedVersion);
    if (this.props.status !== "OPEN") {
      throw new ConflictError("Only OPEN turnover tasks can be auto-reconciled");
    }
    if (this.props.source !== "TURNOVER") {
      throw new ConflictError("Not a turnover task");
    }
    this.props.propertyId = patch.propertyId;
    this.props.unitId = patch.unitId;
    this.props.dueAt = patch.dueAt;
    if (patch.guestId !== undefined) {
      this.props.guestId = patch.guestId;
    }
    this.bump(at);
  }

  /** Retire canonical sourceKey so a new canonical turnover can be created. */
  retireSourceKey(
    expectedVersion: number,
    newSourceKey: string,
    at: Date = new Date(),
  ): void {
    this.assertExpectedVersion(expectedVersion);
    this.props.sourceKey = newSourceKey;
    this.bump(at);
  }
}
