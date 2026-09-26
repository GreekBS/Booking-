import { ConflictError } from "../../shared/errors/DomainError";
import type { TaskStatus } from "./TaskTypes";

const ALLOWED: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  OPEN: new Set(["IN_PROGRESS", "CANCELLED"]),
  IN_PROGRESS: new Set(["OPEN", "COMPLETED", "CANCELLED"]),
  COMPLETED: new Set(["OPEN"]),
  CANCELLED: new Set(),
};

export const TaskStateMachine = {
  assertCanTransition(from: TaskStatus, to: TaskStatus): void {
    if (from === to) {
      throw new ConflictError(`Task already ${from}`);
    }
    if (!ALLOWED[from].has(to)) {
      throw new ConflictError(`Cannot transition Task from ${from} to ${to}`);
    }
  },

  canTransition(from: TaskStatus, to: TaskStatus): boolean {
    return from !== to && ALLOWED[from].has(to);
  },
};
