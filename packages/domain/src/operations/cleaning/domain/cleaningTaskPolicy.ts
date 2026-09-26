import type { TaskSource, TaskStatus, UnitHousekeepingStatusValue } from "../../domain/TaskTypes";

/** Minimal housekeeping task slice the selection policy needs. */
export interface CleaningCandidateTask {
  id: string;
  status: TaskStatus;
  source: TaskSource;
  createdAt: Date;
}

export type CleaningTaskSelection =
  | { kind: "EXISTING"; taskId: string; reason: CleaningTaskSelectionReason }
  | { kind: "CREATE_MANUAL" }
  | { kind: "NO_WORK" };

export type CleaningTaskSelectionReason =
  | "IN_PROGRESS"
  | "OPEN_TURNOVER"
  | "OLDEST_OPEN";

/**
 * QR task selection policy (ADR-030), in strict order:
 *   1. an IN_PROGRESS housekeeping task on the unit
 *   2. an OPEN TURNOVER housekeeping task
 *   3. the oldest remaining OPEN housekeeping task
 *   4. a new MANUAL housekeeping task, but only while the unit is DIRTY
 *   5. otherwise there is nothing to clean
 *
 * `tasks` must already be filtered to HOUSEKEEPING tasks for the single unit.
 */
export function selectCleaningTask(input: {
  housekeepingStatus: UnitHousekeepingStatusValue;
  tasks: readonly CleaningCandidateTask[];
}): CleaningTaskSelection {
  const byOldest = [...input.tasks].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const inProgress = byOldest.find((t) => t.status === "IN_PROGRESS");
  if (inProgress) {
    return { kind: "EXISTING", taskId: inProgress.id, reason: "IN_PROGRESS" };
  }

  const openTurnover = byOldest.find(
    (t) => t.status === "OPEN" && t.source === "TURNOVER",
  );
  if (openTurnover) {
    return { kind: "EXISTING", taskId: openTurnover.id, reason: "OPEN_TURNOVER" };
  }

  const oldestOpen = byOldest.find((t) => t.status === "OPEN");
  if (oldestOpen) {
    return { kind: "EXISTING", taskId: oldestOpen.id, reason: "OLDEST_OPEN" };
  }

  if (input.housekeepingStatus === "DIRTY") {
    return { kind: "CREATE_MANUAL" };
  }

  return { kind: "NO_WORK" };
}
