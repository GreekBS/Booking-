import type { Task } from "../domain/Task";
import type { UnitHousekeepingStatus } from "../domain/UnitHousekeepingStatus";

/** Confirmed booking slice needed for turnover reconciliation. */
export interface TurnoverBookingSnapshot {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  guestId: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  propertyTimezone: string;
}

export interface ApplyTurnoverEnsureCommand {
  booking: TurnoverBookingSnapshot;
  /** Property-local today YYYY-MM-DD. */
  propertyLocalToday: string;
  /** When checkOut <= propertyLocalToday, mark DIRTY. */
  markDirtyIfDue: boolean;
  actorUserId: string | null;
  now?: Date;
}

export interface ApplyTurnoverEnsureResult {
  task: Task;
  housekeeping: UnitHousekeepingStatus;
  created: boolean;
  reconciled: boolean;
  markedDirty: boolean;
  historyPreserved: boolean;
}

export interface CancelTurnoverForBookingCommand {
  tenantId: string;
  bookingId: string;
  actorUserId: string | null;
  now?: Date;
}

/**
 * Atomic turnover operations (Task + UnitHousekeepingStatus in one TX).
 * Also used for Complete/Reopen housekeeping side effects.
 */
export interface IHousekeepingTurnoverStore {
  findConfirmedBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<TurnoverBookingSnapshot | null>;

  /**
   * Bookings eligible for scheduled generation within lookback window
   * for a single property-local day evaluation (caller supplies today per property).
   */
  listDueConfirmedBookings(input: {
    lookbackDays: number;
    at: Date;
    limit: number;
  }): Promise<TurnoverBookingSnapshot[]>;

  ensureTurnover(command: ApplyTurnoverEnsureCommand): Promise<ApplyTurnoverEnsureResult>;

  cancelOpenTurnoverTasks(
    command: CancelTurnoverForBookingCommand,
  ): Promise<{ cancelledTaskIds: string[] }>;

  /**
   * Complete HOUSEKEEPING task and mark unit CLEAN atomically when unitId set.
   */
  completeHousekeepingTask(input: {
    tenantId: string;
    taskId: string;
    expectedVersion: number;
    completionNote?: string | null;
    actorUserId: string | null;
    now?: Date;
  }): Promise<{ task: Task; housekeeping: UnitHousekeepingStatus | null }>;

  /**
   * Reopen HOUSEKEEPING task and mark unit DIRTY when unitId set.
   */
  reopenHousekeepingTask(input: {
    tenantId: string;
    taskId: string;
    expectedVersion: number;
    actorUserId: string | null;
    now?: Date;
  }): Promise<{ task: Task; housekeeping: UnitHousekeepingStatus | null }>;
}
