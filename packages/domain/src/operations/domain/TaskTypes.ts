export const TASK_CATEGORIES = [
  "HOUSEKEEPING",
  "MAINTENANCE",
  "INSPECTION",
  "GUEST_REQUEST",
  "GENERAL",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["NORMAL", "HIGH", "URGENT"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_SOURCES = ["MANUAL", "TURNOVER", "SYSTEM"] as const;

export type TaskSource = (typeof TASK_SOURCES)[number];

export const UNIT_HOUSEKEEPING_STATUSES = ["CLEAN", "DIRTY"] as const;

export type UnitHousekeepingStatusValue =
  (typeof UNIT_HOUSEKEEPING_STATUSES)[number];

export const UNIT_HOUSEKEEPING_SOURCES = [
  "INIT",
  "TURNOVER",
  "TASK_COMPLETE",
  "TASK_REOPEN",
  "MANUAL",
  "SYSTEM",
] as const;

export type UnitHousekeepingSource =
  (typeof UNIT_HOUSEKEEPING_SOURCES)[number];
